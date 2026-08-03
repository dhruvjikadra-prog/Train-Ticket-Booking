import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    Bot,
    ChevronDown,
    MessageCircle,
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

function Chatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState(initialMessages);
    const [isSending, setIsSending] = useState(false);
    const [serverOnline, setServerOnline] = useState(null);
    const [conversationContext, setConversationContext] = useState({});
    const [quickPrompts, setQuickPrompts] = useState(defaultQuickPrompts);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

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
                text: serverReply || buildFallbackReply(trimmedMessage),
                result: error.response?.data?.result || null
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

    return (
        <div className={`chatbot-shell ${isOpen ? "is-open" : ""}`}>
            {isOpen && (
                <section
                    className={`chatbot-panel ${isMinimized ? "is-minimized" : ""}`}
                    aria-label="RailGo Assistant"
                >
                    <div className="chatbot-header">
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

                                            <div className="chatbot-message-bubble">
                                                {message.text}
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
                                    maxLength={300}
                                    placeholder="Type your question..."
                                    aria-label="Type your question"
                                    onChange={(event) => setInput(event.target.value)}
                                />

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
                className="chatbot-launcher"
                aria-label={isOpen ? "Close RailGo Assistant" : "Open RailGo Assistant"}
                aria-expanded={isOpen}
                onClick={() => {
                    setIsOpen((current) => !current);
                    setIsMinimized(false);
                }}
            >
                {isOpen ? <X size={24} /> : <MessageCircle size={27} />}
                {!isOpen && <span>AI Help</span>}
            </button>
        </div>
    );
}

export default Chatbot;
