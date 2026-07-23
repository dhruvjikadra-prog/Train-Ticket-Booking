import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import JourneyLoader from "./JourneyLoader";
import { wait } from "../utils/loading";
import "react-datepicker/dist/react-datepicker.css";
import "../Styles/Hero.css";


function Hero() {
    const navigate = useNavigate();

    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [selectedFrom, setSelectedFrom] = useState(null);
    const [selectedTo, setSelectedTo] = useState(null);
    const [date, setDate] = useState(new Date());
    const [trainClass, setTrainClass] = useState("All Class");
    const [searching, setSearching] = useState(false);
    const [errors, setErrors] = useState({
        from: "",
        to: "",
        date: "",
        train: ""
    });

    const [fromSuggestions, setFromSuggestions] = useState([]);
    const [toSuggestions, setToSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState({
        from: false,
        to: false
    });
    const [activeField, setActiveField] = useState(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const debounceTimers = useRef({});
    const requestIds = useRef({
        from: 0,
        to: 0
    });

    const [searchMode, setSearchMode] = useState("station");

    const [trainQuery, setTrainQuery] = useState("");
    const [selectedTrain, setSelectedTrain] = useState(null);
    const [trainSuggestions, setTrainSuggestions] = useState([]);
    const [trainLoading, setTrainLoading] = useState(false);
    const [trainSuggestionsOpen, setTrainSuggestionsOpen] = useState(false);
    const [trainHighlightedIndex, setTrainHighlightedIndex] = useState(-1);
    const trainDebounceTimer = useRef(null);
    const trainRequestId = useRef(0);

    const fieldConfig = useMemo(() => ({
        from: {
            value: from,
            suggestions: fromSuggestions,
            setValue: setFrom,
            setSuggestions: setFromSuggestions,
            loading: loadingSuggestions.from,
            label: "From",
            placeholder: "Enter origin station",
            icon: "fa-train",
            helper: "Choose your boarding station"
        },
        to: {
            value: to,
            suggestions: toSuggestions,
            setValue: setTo,
            setSuggestions: setToSuggestions,
            loading: loadingSuggestions.to,
            label: "To",
            placeholder: "Enter destination station",
            icon: "fa-location-dot",
            helper: "Choose your destination station"
        }
    }), [from, fromSuggestions, loadingSuggestions, to, toSuggestions]);

    const swapStations = () => {
        setFrom(to);
        setTo(from);
        setSelectedFrom(selectedTo);
        setSelectedTo(selectedFrom);
        setFromSuggestions([]);
        setToSuggestions([]);
        setLoadingSuggestions({
            from: false,
            to: false
        });
        setActiveField(null);
        setHighlightedIndex(-1);
        setErrors((current) => ({
            ...current,
            from: "",
            to: ""
        }));
    };

    const formatSearchDate = (value) => {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    };

    const handleSearch = async () => {
        if (searchMode === "train") {
            await handleTrainSearch();
            return;
        }

        await handleStationSearch();
    };

    const handleStationSearch = async () => {
        const newErrors = {
            from: "",
            to: "",
            date: "",
            train: ""
        };

        let isValid = true;

        if (!from.trim()) {
            newErrors.from = "Please select departure station";
            isValid = false;
        } else if (!selectedFrom) {
            newErrors.from = "Select a valid station from the suggestions";
            isValid = false;
        }

        if (!to.trim()) {
            newErrors.to = "Please select destination station";
            isValid = false;
        } else if (!selectedTo) {
            newErrors.to = "Select a valid station from the suggestions";
            isValid = false;
        }

        if (
            selectedFrom &&
            selectedTo &&
            selectedFrom.code === selectedTo.code
        ) {
            newErrors.to =
                "Departure and destination stations cannot be same";
            isValid = false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            newErrors.date = "Select a valid journey date";
            isValid = false;
        } else if (date < today) {
            newErrors.date = "Journey date cannot be in the past";
            isValid = false;
        }

        setErrors(newErrors);

        if (!isValid) return;

        const params = new URLSearchParams({
            from: selectedFrom.code,
            to: selectedTo.code,
            date: formatSearchDate(date),
            class: trainClass
        });

        setSearching(true);
        await wait(2200);
        navigate(`/trains?${params.toString()}`);
    };

    const handleTrainSearch = async () => {
        const newErrors = {
            from: "",
            to: "",
            date: "",
            train: ""
        };

        let isValid = true;

        if (!trainQuery.trim()) {
            newErrors.train = "Please Enter Train Number or Name";
            isValid = false;
        } else if (!selectedTrain) {
            newErrors.train = "Select a valid train from the suggestions";
            isValid = false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            newErrors.date = "Select a valid journey date";
            isValid = false;
        } else if (date < today) {
            newErrors.date = "Journey date cannot be in the past";
            isValid = false;
        }

        setErrors(newErrors);

        if (!isValid) return;

        const params = new URLSearchParams({
            train: selectedTrain.number,
            date: formatSearchDate(date)
        });

        setSearching(true);
        await wait(2200);
        navigate(`/train-schedule?${params.toString()}`);
    };

    const clearFieldSuggestions = (type) => {
        const config = fieldConfig[type];

        window.clearTimeout(debounceTimers.current[type]);
        requestIds.current[type] += 1;
        config.setSuggestions([]);
        setLoadingSuggestions((current) => ({
            ...current,
            [type]: false
        }));
        setHighlightedIndex(-1);
    };

    const fetchStationSuggestions = (value, type, immediate = false) => {
        const searchText = value.trim();
        const config = fieldConfig[type];

        if (!searchText || searchText.length < 2) {
            clearFieldSuggestions(type);
            return;
        }

        window.clearTimeout(debounceTimers.current[type]);
        setActiveField(type);
        setLoadingSuggestions((current) => ({
            ...current,
            [type]: true
        }));

        const runSearch = async () => {
            const currentRequestId = requestIds.current[type] + 1;
            requestIds.current[type] = currentRequestId;

            try {
                const res = await axios.get(`${API_BASE_URL}/stations/suggestions`, {
                    params: {
                        q: searchText
                    }
                });

                if (requestIds.current[type] !== currentRequestId) {
                    return;
                }

                const result = res.data?.stations || [];

                config.setSuggestions(result);
                setHighlightedIndex(result.length > 0 ? 0 : -1);
            } catch (error) {
                if (requestIds.current[type] === currentRequestId) {
                    config.setSuggestions([]);
                    setHighlightedIndex(-1);
                }
            } finally {
                if (requestIds.current[type] === currentRequestId) {
                    setLoadingSuggestions((current) => ({
                        ...current,
                        [type]: false
                    }));
                }
            }
        };

        if (immediate) {
            runSearch();
            return;
        }

        debounceTimers.current[type] = window.setTimeout(() => {
            runSearch();
        }, 600);
    };

    const filterStations = (value, type) => {
        fetchStationSuggestions(value, type);
    };

    const closeSuggestions = () => {
        setActiveField(null);
        setFromSuggestions([]);
        setToSuggestions([]);
        setLoadingSuggestions({
            from: false,
            to: false
        });
        setHighlightedIndex(-1);
    };

    const selectStation = (station, type) => {
        const config = fieldConfig[type];

        config.setValue(station.name);
        if (type === "from") {
            setSelectedFrom(station);
        } else {
            setSelectedTo(station);
        }
        config.setSuggestions([]);
        setErrors((current) => ({
            ...current,
            [type]: ""
        }));
        setActiveField(null);
        setHighlightedIndex(-1);
    };

    const handleStationFocus = (type) => {
        const config = fieldConfig[type];

        setActiveField(type);

        if (config.value.trim()) {
            fetchStationSuggestions(config.value, type, true);
        }
    };

    const handleStationKeyDown = (event, type) => {
        const suggestions = fieldConfig[type].suggestions;

        if (!suggestions.length) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((current) =>
                current >= suggestions.length - 1 ? 0 : current + 1
            );
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((current) =>
                current <= 0 ? suggestions.length - 1 : current - 1
            );
        }

        if (event.key === "Enter" && highlightedIndex >= 0) {
            event.preventDefault();
            selectStation(suggestions[highlightedIndex], type);
        }

        if (event.key === "Escape") {
            closeSuggestions();
        }
    };

    // ---- Train No / Name search logic (mirrors the station combobox above) ----

    const switchSearchMode = (mode) => {
        setSearchMode(mode);
        setErrors((current) => ({
            ...current,
            from: "",
            to: "",
            date: "",
            train: ""
        }));
    };

    const clearTrainSuggestions = () => {
        window.clearTimeout(trainDebounceTimer.current);
        trainRequestId.current += 1;
        setTrainSuggestions([]);
        setTrainLoading(false);
        setTrainHighlightedIndex(-1);
    };

    const fetchTrainSuggestions = (value, immediate = false) => {
        const searchText = value.trim();

        if (!searchText || searchText.length < 2) {
            clearTrainSuggestions();
            return;
        }

        window.clearTimeout(trainDebounceTimer.current);
        setTrainSuggestionsOpen(true);
        setTrainLoading(true);

        const runSearch = async () => {
            const currentRequestId = trainRequestId.current + 1;
            trainRequestId.current = currentRequestId;

            try {
                const res = await axios.get(`${API_BASE_URL}/trains/suggestions`, {
                    params: {
                        q: searchText
                    }
                });

                if (trainRequestId.current !== currentRequestId) {
                    return;
                }

                const result = res.data?.trains || [];

                setTrainSuggestions(result);
                setTrainHighlightedIndex(result.length > 0 ? 0 : -1);
            } catch (error) {
                if (trainRequestId.current === currentRequestId) {
                    setTrainSuggestions([]);
                    setTrainHighlightedIndex(-1);
                }
            } finally {
                if (trainRequestId.current === currentRequestId) {
                    setTrainLoading(false);
                }
            }
        };

        if (immediate) {
            runSearch();
            return;
        }

        trainDebounceTimer.current = window.setTimeout(() => {
            runSearch();
        }, 450);
    };

    const closeTrainSuggestions = () => {
        setTrainSuggestionsOpen(false);
        setTrainSuggestions([]);
        setTrainLoading(false);
        setTrainHighlightedIndex(-1);
    };

    const selectTrain = (train) => {
        setTrainQuery(`${train.name} (${train.number})`);
        setSelectedTrain(train);
        setTrainSuggestions([]);
        setErrors((current) => ({
            ...current,
            train: ""
        }));
        setTrainSuggestionsOpen(false);
        setTrainHighlightedIndex(-1);
    };

    const handleTrainFocus = () => {
        setTrainSuggestionsOpen(true);

        if (trainQuery.trim()) {
            fetchTrainSuggestions(trainQuery, true);
        }
    };

    const handleTrainKeyDown = (event) => {
        if (!trainSuggestions.length) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setTrainHighlightedIndex((current) =>
                current >= trainSuggestions.length - 1 ? 0 : current + 1
            );
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setTrainHighlightedIndex((current) =>
                current <= 0 ? trainSuggestions.length - 1 : current - 1
            );
        }

        if (event.key === "Enter" && trainHighlightedIndex >= 0) {
            event.preventDefault();
            selectTrain(trainSuggestions[trainHighlightedIndex]);
        }

        if (event.key === "Escape") {
            closeTrainSuggestions();
        }
    };

    useEffect(() => {
        const timers = debounceTimers.current;

        return () => {
            Object.values(timers).forEach((timer) =>
                window.clearTimeout(timer)
            );
            requestIds.current.from += 1;
            requestIds.current.to += 1;
            window.clearTimeout(trainDebounceTimer.current);
            trainRequestId.current += 1;
        };
    }, []);

    const renderStationField = (type) => {
        const config = fieldConfig[type];
        const hasSearchText = config.value.trim().length > 0;
        const isOpen = activeField === type && hasSearchText;
        const inputId = `${type}-station`;
        const listId = `${type}-station-suggestions`;

        return (
            <div className="station-field">
                <label htmlFor={inputId} className="hero-label">
                    {config.label}
                </label>

                <input
                    id={inputId}
                    type="text"
                    className="form-control custom-input"
                    placeholder={config.placeholder}
                    value={config.value}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    onFocus={() => handleStationFocus(type)}
                    onBlur={() => {
                        window.setTimeout(closeSuggestions, 120);
                    }}
                    onKeyDown={(event) => handleStationKeyDown(event, type)}
                    onChange={(e) => {
                        config.setValue(e.target.value);
                        if (type === "from") {
                            setSelectedFrom(null);
                        } else {
                            setSelectedTo(null);
                        }

                        setErrors((prev) => ({
                            ...prev,
                            [type]: ""
                        }));

                        filterStations(e.target.value, type);
                    }}
                />

                {isOpen && (
                    <ul
                        id={listId}
                        className="suggestion-box"
                        role="listbox"
                        aria-label={`${config.label} station suggestions`}
                    >
                        {config.loading && (
                            <li className="suggestion-status">
                                <i className="fa-solid fa-train-subway station-search-icon"></i>
                                Searching stations...
                            </li>
                        )}

                        {!config.loading && config.suggestions.length === 0 && (
                            <li className="suggestion-status">
                                No stations found
                            </li>
                        )}

                        {!config.loading && config.suggestions.map((station, index) => (
                            <li
                                key={station.code}
                                className={index === highlightedIndex ? "active" : ""}
                                role="option"
                                aria-selected={index === highlightedIndex}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectStation(station, type);
                                }}
                            >
                                <div className="station-item">
                                    <div className="station-icon">
                                        <i className={`fa-solid ${config.icon}`}></i>
                                    </div>

                                    <div className="station-details">
                                        <div className="station-name">
                                            {station.name}
                                            <span className="station-code">({station.code})</span>
                                        </div>

                                        <div className="station-desc">
                                            {/* {station.desc || `${station.city}, ${station.state}`} */}
                                            {station.city}, {station.state}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div
                    className="field-helper"
                    style={{
                        color: errors[type] ? "#dc3545" : "",
                        fontWeight: errors[type] ? "600" : ""
                    }}
                >
                    {errors[type] || config.helper}
                </div>
            </div>
        );
    };

    const renderTrainField = () => {
        const isOpen = trainSuggestionsOpen && trainQuery.trim().length > 0;

        return (
            <div className="station-field">
                <label htmlFor="train-search" className="hero-label">
                    Train No / Name
                </label>

                <input
                    id="train-search"
                    type="text"
                    className="form-control custom-input"
                    placeholder="Enter train number or name"
                    value={trainQuery}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={isOpen}
                    aria-controls="train-suggestions"
                    aria-autocomplete="list"
                    onFocus={handleTrainFocus}
                    onBlur={() => {
                        window.setTimeout(closeTrainSuggestions, 120);
                    }}
                    onKeyDown={handleTrainKeyDown}
                    onChange={(e) => {
                        setTrainQuery(e.target.value);
                        setSelectedTrain(null);
                        setErrors((prev) => ({
                            ...prev,
                            train: ""
                        }));
                        fetchTrainSuggestions(e.target.value);
                    }}
                />

                {isOpen && (
                    <ul
                        id="train-suggestions"
                        className="suggestion-box"
                        role="listbox"
                        aria-label="Train suggestions"
                    >
                        {trainLoading && (
                            <li className="suggestion-status">
                                <i className="fa-solid fa-train-subway station-search-icon"></i>
                                Searching trains...
                            </li>
                        )}

                        {!trainLoading && trainSuggestions.length === 0 && (
                            <li className="suggestion-status">
                                No trains found
                            </li>
                        )}

                        {!trainLoading && trainSuggestions.map((train, index) => (
                            <li
                                key={train.number}
                                className={index === trainHighlightedIndex ? "active" : ""}
                                role="option"
                                aria-selected={index === trainHighlightedIndex}
                                onMouseEnter={() => setTrainHighlightedIndex(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectTrain(train);
                                }}
                            >
                                <div className="station-item">
                                    <div className="station-icon">
                                        <i className="fa-solid fa-train"></i>
                                    </div>

                                    <div className="station-details">
                                        <div className="station-name">
                                            {train.name}
                                            <span className="station-code">({train.number})</span>
                                        </div>

                                        <div className="station-desc">
                                            {train.from} → {train.to}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div
                    className="field-helper"
                    style={{
                        color: errors.train ? "#dc3545" : "",
                        fontWeight: errors.train ? "600" : ""
                    }}
                >
                    {errors.train || "Enter train number, e.g. 12951 or Rajdhani"}
                </div>
            </div>
        );
    };

    const renderDateField = () => (
        <>
            <label className="hero-label" htmlFor="journey-date">
                Date
            </label>

            <DatePicker
                id="journey-date"
                selected={date}
                onChange={(d) => {
                    setDate(d);
                    setErrors((current) => ({
                        ...current,
                        date: ""
                    }));
                }}
                minDate={new Date()}
                dateFormat="dd MMM yyyy"
                className="form-control custom-input inp-date"
                popperPlacement="bottom-start"
            />
            <div
                className="field-helper"
                style={{
                    color: errors.date ? "#dc3545" : "",
                    fontWeight: errors.date ? "600" : ""
                }}
            >
                {errors.date || "Select travel date"}
            </div>
        </>
    );

    return (
        <div className="hero-section">

            <div className="overlay">

                <div className="container">

                    <div className="hero-content">

                        <h1>Your Journey,<span className="cutting"> Our Priority </span></h1>

                        <p>Fast, Easy & Secure Railway Booking</p>

                        <div className="hero-search-tabs-wrapper">

                            <div className="hero-search-tabs" role="tablist" aria-label="Search by station or train">

                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={searchMode === "station"}
                                    className={`hero-tab ${searchMode === "station" ? "active" : ""}`}
                                    onClick={() => switchSearchMode("station")}
                                >
                                    <i className="fa-solid fa-route me-2"></i>
                                    Search by Station
                                </button>

                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={searchMode === "train"}
                                    className={`hero-tab ${searchMode === "train" ? "active" : ""}`}
                                    onClick={() => switchSearchMode("train")}
                                >
                                    <i className="fa-solid fa-train me-2"></i>
                                    Train No / Name
                                </button>

                            </div>

                        </div>

                        <div className="search-card">

                            {searchMode === "station" ? (
                                <div className="row g-3 align-items-center">

                                    {/* FROM */}

                                    <div className="col-lg-3 position-relative">
                                        {renderStationField("from")}

                                    </div>

                                    {/* SWAP */}

                                    <div className="col-lg-1 text-center">

                                        <button
                                            type="button"
                                            aria-label="Swap from and to stations"
                                            className="swap-btn"
                                            onClick={swapStations}
                                        >
                                            <i className="fa-solid fa-right-left"></i>
                                        </button>

                                    </div>

                                    {/* TO */}

                                    <div className="col-lg-3 position-relative">
                                        {renderStationField("to")}

                                    </div>

                                    {/* DATE */}

                                    <div className="col-lg-2">
                                        {renderDateField()}
                                    </div>

                                    {/* CLASS */}

                                    <div className="col-lg-3">
                                        <label className="hero-label" htmlFor="train-class">
                                            Class
                                        </label>

                                        <select
                                            id="train-class"
                                            className="form-select custom-input"
                                            value={trainClass}
                                            onChange={(e) =>
                                                setTrainClass(e.target.value)
                                            }
                                            style={{ cursor: 'pointer'}}
                                        >
                                            <option>All Class</option>
                                            <option>Sleeper</option>
                                            <option>AC 3 Tier</option>
                                            <option>AC 2 Tier</option>
                                            <option>First AC</option>
                                        </select>
                                        <div className="field-helper">
                                            Choose coach preference
                                        </div>

                                    </div>

                                </div>
                            ) : (
                                <div className="row g-3 align-items-center">

                                    {/* TRAIN NO / NAME */}

                                    <div className="col-lg-8 position-relative">
                                        {renderTrainField()}

                                    </div>

                                    {/* DATE */}

                                    <div className="col-lg-4">
                                        {renderDateField()}
                                    </div>

                                </div>
                            )}

                            {/* FLOATING SEARCH BUTTON */}

                            <div className="search-btn-wrapper">
                                
                                <button
                                    type="button"
                                    className="search-btn-custom"
                                    onClick={handleSearch}
                                    disabled={searching}
                                >
                                    {/* <i className="fa-solid fa-magnifying-glass search-icon me-2"></i> */}
                                    {searching ? "SEARCHING..." : "SEARCH"}
                                </button>

                            </div>

                        </div>

                    </div>

                </div>

            </div>

            {searching && (
                <JourneyLoader
                    mode="overlay"
                    title={searchMode === "train" ? "Finding your train" : "Finding your best trains"}
                    subtitle={
                        searchMode === "train"
                            ? "Checking live running status, schedule, and seat availability."
                            : "Checking routes, schedules, classes, and live seat availability."
                    }
                />
            )}
        </div>
    );
}

export default Hero;