import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import "../Styles/StationFieldPair.css";

const STATION_API_BASE = `${API_BASE_URL}/stations`;
const stationApi = axios.create({ baseURL: STATION_API_BASE });

/**
 * Renders a "Code" input and a "Station" name input side by side.
 * Typing in either field queries /api/stations/suggestions and shows a
 * dropdown of matching stations. Picking one fills both fields at once.
 */
function StationFieldPair({
    codeLabel = "Code",
    nameLabel = "Station",
    codeValue,
    nameValue,
    onCodeChange,
    onNameChange,
    onSelectStation,
    codeError,
    nameError,
    codeMaxLength = 10,
    nameMaxLength = 80,
    wideName = true,
    disabled = false
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const [loadingSug, setLoadingSug] = useState(false);
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        function handleOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setOpen(false);
                setHighlighted(-1);
            }
        }

        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    const runSearch = (text) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = text.trim();

        if (!trimmed) {
            setSuggestions([]);
            setOpen(false);
            setLoadingSug(false);
            return;
        }

        const thisRequestId = ++requestIdRef.current;
        setLoadingSug(true);
        setOpen(true);

        debounceRef.current = setTimeout(async () => {
            try {
                const response = await stationApi.get("/suggestions", { params: { q: trimmed } });
                if (thisRequestId !== requestIdRef.current) return;
                setSuggestions(response.data.stations || []);
                setHighlighted(-1);
            } catch {
                if (thisRequestId === requestIdRef.current) setSuggestions([]);
            } finally {
                if (thisRequestId === requestIdRef.current) setLoadingSug(false);
            }
        }, 250);
    };

    const handleCodeInput = (event) => {
        const text = event.target.value;
        onCodeChange(text);
        runSearch(text);
    };

    const handleNameInput = (event) => {
        const text = event.target.value;
        onNameChange(text);
        runSearch(text);
    };

    const selectStation = (station) => {
        onSelectStation(station);
        setSuggestions([]);
        setOpen(false);
        setHighlighted(-1);
    };

    const handleKeyDown = (event) => {
        if (!open || !suggestions.length) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((current) => (current + 1) % suggestions.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
        } else if (event.key === "Enter") {
            if (highlighted >= 0) {
                event.preventDefault();
                selectStation(suggestions[highlighted]);
            }
        } else if (event.key === "Escape") {
            setOpen(false);
            setHighlighted(-1);
        }
    };

    return (
        <div className="sfp-wrapper" ref={wrapperRef}>
            <label className="aat-field">
                <span>{codeLabel}</span>
                <input
                    type="text"
                    maxLength={codeMaxLength}
                    value={codeValue}
                    onChange={handleCodeInput}
                    onKeyDown={handleKeyDown}
                    onFocus={() => { if (suggestions.length) setOpen(true); }}
                    aria-invalid={Boolean(codeError)}
                    autoComplete="off"
                    disabled={disabled}
                />
                {codeError && <span className="aat-field-error">{codeError}</span>}
            </label>

            <label className={`aat-field sfp-name-field ${wideName ? "aat-field-wide" : ""}`}>
                <span>{nameLabel}</span>
                <input
                    type="text"
                    maxLength={nameMaxLength}
                    value={nameValue}
                    onChange={handleNameInput}
                    onKeyDown={handleKeyDown}
                    onFocus={() => { if (suggestions.length) setOpen(true); }}
                    aria-invalid={Boolean(nameError)}
                    autoComplete="off"
                    disabled={disabled}
                />
                {nameError && <span className="aat-field-error">{nameError}</span>}

                {open && (
                    <div className="sfp-dropdown" role="listbox">
                        {loadingSug && <div className="sfp-status">Searching…</div>}
                        {!loadingSug && suggestions.length === 0 && (
                            <div className="sfp-status">No stations found</div>
                        )}
                        {!loadingSug && suggestions.map((station, index) => (
                            <button
                                type="button"
                                key={station._id || station.code}
                                className={`sfp-option ${index === highlighted ? "is-highlighted" : ""}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectStation(station)}
                                role="option"
                                aria-selected={index === highlighted}
                            >
                                <span className="sfp-option-code">{station.code}</span>
                                <span className="sfp-option-name">{station.name}</span>
                                {(station.city || station.state) && (
                                    <span className="sfp-option-city">
                                        {station.city}{station.city && station.state ? ", " : ""}{station.state}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </label>
        </div>
    );
}

export default StationFieldPair;