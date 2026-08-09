import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    Bot,
    ChevronDown,
    MessageCircle,
    Move,
    RefreshCw,
    Send,
    Sparkles,
    User,
    X
} from "lucide-react";
import { API_BASE_URL } from "../config/api";
import "../Styles/Chatbot.css";

const initialMessages = [
    {
        id: "welcome",
        role: "assistant",
        text: "Hi, I am RailGo Assistant. Ask me about booking tickets, PNR status, train search, cancellations, payments, or account help."
    }
];

const defaultQuickPrompts = [
    "Find my latest booking",
    "Check my PNR status",
    "Payment status",
    "Cancel booking"
];

const buildFallbackReply = (message) => {
    const normalized = message.toLowerCase();

    if (normalized.includes("pnr")) {
        return "You can open PNR Status from the navbar and enter your 10-digit PNR number. I can also help explain booking status, payment status, and cancellation status.";
    }

    if (normalized.includes("cancel") || normalized.includes("refund")) {
        return "For cancellation, open My Bookings, choose the ticket, and select Cancel. Refund information will appear with the booking after cancellation is processed.";
    }

    if (normalized.includes("payment") || normalized.includes("paid")) {
        return "If payment failed, please check whether money was debited. You can retry payment from the booking flow, or check My Bookings for the latest payment status.";
    }

    if (normalized.includes("book") || normalized.includes("ticket") || normalized.includes("train")) {
        return "To book a ticket, search by station or train number on the home page, select a journey date and class, then continue through passenger details, seat selection, review, and payment.";
    }

    return "I can help with train search, booking, PNR status, payments, cancellations, and account issues. Tell me what you are trying to do and I will guide you step by step.";
};

const isDetailedReply = (text) => typeof text === "string" && text.includes("\n");

const DRAG_EDGE_GAP = 12;
const DRAG_THRESHOLD = 5;
const POSITION_STORAGE_KEY = "railgo-chatbot-position";

const clampPosition = (x, y, width, height) => {
    if (typeof window === "undefined") {
        return { x, y };
    }

    const maxX = Math.max(DRAG_EDGE_GAP, window.innerWidth - width - DRAG_EDGE_GAP);
    const maxY = Math.max(DRAG_EDGE_GAP, window.innerHeight - height - DRAG_EDGE_GAP);

    return {
        x: Math.min(Math.max(DRAG_EDGE_GAP, x), maxX),
        y: Math.min(Math.max(DRAG_EDGE_GAP, y), maxY)
    };
};

const readStoredPosition = () => {
    if (typeof window === "undefined") return null;

    try {
        const savedPosition = JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY) || "null");

        if (
            savedPosition &&
            Number.isFinite(savedPosition.x) &&
            Number.isFinite(savedPosition.y)
        ) {
            return savedPosition;
        }
    } catch {
        // Ignore invalid saved positions and fall back to the default corner.
    }

    return null;
};

const getDetailTone = (value) => {
    const normalized = String(value || "").toLowerCase();

    if (/(cancel|failed|failure|not found|could not|invalid|error)/.test(normalized)) {
        return "danger";
    }

    if (/(pending|wait|not generated|processing|selected)/.test(normalized)) {
        return "warning";
    }

    if (/(paid|confirmed|active|success|completed|generated|online)/.test(normalized)) {
        return "success";
    }

    return "info";
};

const shouldUseCodeStyle = (label) =>
    /pnr|ref|reference|transaction|token/i.test(label || "");

const renderDetailValue = (label, value) => {
    const detailParts = String(value || "")
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);

    if (detailParts.length > 1) {
        return (
            <span className="chatbot-detail-chips">
                {detailParts.map((part) => (
                    <span
                        key={part}
                        className={`chatbot-detail-chip tone-${getDetailTone(part)}`}
                    >
                        {part}
                    </span>
                ))}
            </span>
        );
    }

    return (
        <span className={shouldUseCodeStyle(label) ? "chatbot-detail-code" : undefined}>
            {value}
        </span>
    );
};

const renderMessageContent = (text) => {
    if (!isDetailedReply(text)) return text;

    const lines = String(text)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const [title, ...details] = lines;

    return (
        <div className="chatbot-detail-card">
            <div className={`chatbot-detail-title tone-${getDetailTone(text)}`}>
                {title}
            </div>

            <div className="chatbot-detail-list">
                {details.map((line, index) => {
                    const separatorIndex = line.indexOf(":");

                    if (separatorIndex <= 0) {
                        return (
                            <div key={`${line}-${index}`} className="chatbot-detail-note">
                                {line}
                            </div>
                        );
                    }

                    const label = line.slice(0, separatorIndex).trim();
                    const value = line.slice(separatorIndex + 1).trim();

                    return (
                        <div key={`${label}-${index}`} className="chatbot-detail-row">
                            <span className="chatbot-detail-label">{label}</span>
                            <span className="chatbot-detail-value">
                                {renderDetailValue(label, value)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function Chatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState(initialMessages);
    const [isSending, setIsSending] = useState(false);
    const [serverOnline, setServerOnline] = useState(null);
    const [conversationContext, setConversationContext] = useState({});
    const [quickPrompts, setQuickPrompts] = useState(defaultQuickPrompts);
    const [position, setPosition] = useState(readStoredPosition);
    const [isDragging, setIsDragging] = useState(false);
    const shellRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const dragStateRef = useRef(null);
    const suppressClickRef = useRef(false);
    const MAX_CHARS = 200;
    const remaining = MAX_CHARS - input.length;

    const counterColor = remaining <= 20 ? "#dc3545" : remaining <= 50 ? "#fd7e14" : "#0d6efd";

    const progress = (input.length / MAX_CHARS) * 100;

    const canSend = input.trim().length > 0 && !isSending;

    const statusText = useMemo(() => {
        if (serverOnline === false) return "Testing fallback mode";
        if (isSending) return "Typing...";
        return "Online for support";
    }, [isSending, serverOnline]);

    useEffect(() => {
        if (!isOpen || isMinimized) return;

        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isOpen, isMinimized]);

    useEffect(() => {
        if (!isOpen || isMinimized) return;

        const focusTimer = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 120);

        return () => window.clearTimeout(focusTimer);
    }, [isOpen, isMinimized]);

    useEffect(() => {
        if (!position) return;

        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    }, [position]);

    useEffect(() => {
        if (!isOpen || !position) return;

        const keepChatInView = () => {
            const rect = shellRef.current?.getBoundingClientRect();

            if (!rect) return;

            setPosition((current) => {
                if (!current) return current;

                const nextPosition = clampPosition(current.x, current.y, rect.width, rect.height);

                return nextPosition.x === current.x && nextPosition.y === current.y
                    ? current
                    : nextPosition;
            });
        };

        const frameId = window.requestAnimationFrame(keepChatInView);
        window.addEventListener("resize", keepChatInView);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("resize", keepChatInView);
        };
    }, [isOpen, isMinimized, position]);

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (event) => {
            const dragState = dragStateRef.current;

            if (!dragState) return;

            const distanceX = Math.abs(event.clientX - dragState.startX);
            const distanceY = Math.abs(event.clientY - dragState.startY);

            if (distanceX > DRAG_THRESHOLD || distanceY > DRAG_THRESHOLD) {
                dragState.didDrag = true;
                suppressClickRef.current = true;
            }

            const nextPosition = clampPosition(
                event.clientX - dragState.offsetX,
                event.clientY - dragState.offsetY,
                dragState.width,
                dragState.height
            );

            setPosition(nextPosition);
        };

        const endDrag = () => {
            const dragState = dragStateRef.current;

            if (dragState?.didDrag) {
                window.setTimeout(() => {
                    suppressClickRef.current = false;
                }, 0);
            } else {
                suppressClickRef.current = false;
            }

            dragStateRef.current = null;
            setIsDragging(false);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", endDrag);
            window.removeEventListener("pointercancel", endDrag);
        };
    }, [isDragging]);

    const startDrag = (event) => {
        if (!isOpen) return;
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest(".chatbot-icon-btn")) return;

        const rect = shellRef.current?.getBoundingClientRect();

        if (!rect) return;

        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height,
            didDrag: false
        };

        setPosition(clampPosition(rect.left, rect.top, rect.width, rect.height));
        setIsDragging(true);
    };

    const resetChat = () => {
        setMessages(initialMessages);
        setInput("");
        setServerOnline(null);
        setConversationContext({});
        setQuickPrompts(defaultQuickPrompts);
    };

    const getAuthHeaders = () => {
        const token = window.localStorage.getItem("token");

        if (!token || token === "null" || token === "undefined") {
            return {};
        }

        return { Authorization: `Bearer ${token}` };
    };

    const updateQuickPrompts = (suggestions) => {
        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            return;
        }

        const normalizedSuggestions = suggestions
            .filter(Boolean)
            .map((suggestion) => String(suggestion).trim())
            .filter(Boolean)
            .slice(0, 4);

        if (normalizedSuggestions.length > 0) {
            setQuickPrompts(normalizedSuggestions);
        }
    };

    const sendMessage = async (messageText = input) => {
        const trimmedMessage = String(messageText || "").trim();

        if (!trimmedMessage || isSending) return;

        const userMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            text: trimmedMessage
        };

        setMessages((current) => [...current, userMessage]);
        setInput("");
        setIsSending(true);

        try {
            const response = await axios.post(
                `${API_BASE_URL}/chatbot/message`,
                {
                    message: trimmedMessage,
                    context: conversationContext
                },
                {
                    headers: getAuthHeaders()
                }
            );

            setServerOnline(true);
            updateQuickPrompts(response.data?.suggestions);

            if (response.data?.context) {
                setConversationContext(response.data.context);
            }

            const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                text: response.data?.reply || buildFallbackReply(trimmedMessage),
                intent: response.data?.intent || null,
                result: response.data?.result || null
            };

            setMessages((current) => [...current, assistantMessage]);
        } catch (error) {
            setServerOnline(false);

            const serverReply = error.response?.data?.reply;
            updateQuickPrompts(error.response?.data?.suggestions);

            const fallbackMessage = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                text: serverReply || buildFallbackReply(trimmedMessage)
            };

            setMessages((current) => [...current, fallbackMessage]);
        } finally {
            setIsSending(false);
        }
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        sendMessage();
    };

    const handleLauncherClick = (event) => {
        if (suppressClickRef.current) {
            event.preventDefault();
            return;
        }

        setIsOpen((current) => !current);
        setIsMinimized(false);
    };

    return (
        <div
            ref={shellRef}
            className={`chatbot-shell ${isOpen ? "is-open" : ""} ${isOpen && position ? "is-positioned" : ""} ${isDragging ? "is-dragging" : ""}`}
            style={
                isOpen && position
                    ? {
                        "--chatbot-left": `${position.x}px`,
                        "--chatbot-top": `${position.y}px`
                    }
                    : undefined
            }
        >
            {isOpen && (
                <section
                    className={`chatbot-panel ${isMinimized ? "is-minimized" : ""}`}
                    aria-label="RailGo Assistant"
                >
                    <div className="chatbot-header" onPointerDown={startDrag}>
                        <div className="chatbot-title-area">
                            <div className="chatbot-avatar">
                                <Bot size={22} strokeWidth={2.2} />
                            </div>

                            <div>
                                <h2>RailGo Assistant</h2>
                                <p>{statusText}</p>
                            </div>
                        </div>

                        <div className="chatbot-header-actions">
                            <span className="chatbot-drag-handle" title="Move chat" aria-hidden="true">
                                <Move size={16} />
                            </span>

                            <button
                                type="button"
                                className="chatbot-icon-btn"
                                aria-label="Reset chat"
                                title="Reset chat"
                                onClick={resetChat}
                            >
                                <RefreshCw size={17} />
                            </button>

                            <button
                                type="button"
                                className="chatbot-icon-btn"
                                aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
                                title={isMinimized ? "Expand chat" : "Minimize chat"}
                                onClick={() => setIsMinimized((current) => !current)}
                            >
                                <ChevronDown size={18} />
                            </button>

                            <button
                                type="button"
                                className="chatbot-icon-btn"
                                aria-label="Close chat"
                                title="Close chat"
                                onClick={() => {
                                    setIsOpen(false);
                                    setIsMinimized(false);
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {!isMinimized && (
                        <>
                            <div className="chatbot-body">
                                <div className="chatbot-helper-strip">
                                    <Sparkles size={16} />
                                    <span>RailGo support preview</span>
                                </div>

                                <div className="chatbot-messages" aria-live="polite">
                                    {messages.map((message) => (
                                        <div
                                            key={message.id}
                                            className={`chatbot-message-row ${message.role}`}
                                        >
                                            <div className="chatbot-message-avatar">
                                                {message.role === "assistant" ? (
                                                    <Bot size={16} />
                                                ) : (
                                                    <User size={15} />
                                                )}
                                            </div>

                                            <div
                                                className={`chatbot-message-bubble${isDetailedReply(message.text) ? " chatbot-detailed" : ""
                                                    }`}
                                            >
                                                {renderMessageContent(message.text)}
                                            </div>
                                        </div>
                                    ))}

                                    {isSending && (
                                        <div className="chatbot-message-row assistant">
                                            <div className="chatbot-message-avatar">
                                                <Bot size={16} />
                                            </div>

                                            <div className="chatbot-message-bubble typing">
                                                <span></span>
                                                <span></span>
                                                <span></span>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="chatbot-prompts">
                                    {quickPrompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            onClick={() => sendMessage(prompt)}
                                            disabled={isSending}
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <form className="chatbot-composer" onSubmit={handleSubmit}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    maxLength={MAX_CHARS}
                                    placeholder="Type your question..."
                                    aria-label="Type your question"
                                    onChange={(event) => setInput(event.target.value)}
                                />

                                <div className="chatbot-char-counter">
                                    <svg width="38" height="38">
                                        <circle
                                            className="counter-bg"
                                            cx="19"
                                            cy="19"
                                            r="16"
                                        />

                                        <circle
                                            className="counter-progress"
                                            cx="19"
                                            cy="19"
                                            r="16"
                                            style={{
                                                stroke: counterColor,
                                                strokeDashoffset: 100 - progress
                                            }}
                                        />
                                    </svg>

                                    <span style={{ color: counterColor }} title={`${remaining} characters remaining`}>
                                        {remaining}
                                    </span>
                                </div>

                                <button
                                    type="submit"
                                    className="chatbot-send-btn"
                                    aria-label="Send message"
                                    title="Send message"
                                    disabled={!canSend}
                                >
                                    <Send size={18} />
                                </button>
                            </form>
                        </>
                    )}
                </section>
            )}

            <button
                type="button"
                className={`chatbot-launcher${isOpen ? " is-open" : ""}`}
                aria-label={isOpen ? "Close RailGo Assistant" : "Open RailGo Assistant"}
                aria-expanded={isOpen}
                onClick={handleLauncherClick}
            >
                <span className="chatbot-launcher-icon-stack">
                    <MessageCircle size={27} className="chatbot-launcher-icon icon-chat" />
                    <X size={24} className="chatbot-launcher-icon icon-close" />
                </span>
                <span className="chatbot-launcher-label">AI Help</span>
            </button>
        </div>
    );
}

export default Chatbot;
