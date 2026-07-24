import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import JourneyLoader from "../Components/JourneyLoader";
import TrainRouteMap from "../Components/TrainRouteMap";
import "../Styles/TrainSchedule.css";


// Sunday-first, matches Date#getDay()
const WEEKDAYS_BY_INDEX = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday-first, matches how Indian Railways usually prints running days
const WEEKDAYS_DISPLAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FACILITY_META = {
    pantry: { label: "Pantry Car", icon: "fa-utensils" },
    wifi: { label: "Wi-Fi", icon: "fa-wifi" },
    chargingPoint: { label: "Charging Point", icon: "fa-plug" },
    blanket: { label: "Bedding", icon: "fa-bed" },
    cctv: { label: "CCTV", icon: "fa-video" }
};

/* ---------------------------- small helpers ---------------------------- */

const parseTimeToMinutes = (time) => {
    if (!time) return null;
    const parts = time.split(":").map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
    return parts[0] * 60 + parts[1];
};

const formatDuration = (totalMinutes) => {
    if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) {
        return "—";
    }
    const minutes = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

const toDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const fromDateKey = (key) => {
    if (!key) return null;
    const parts = key.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

const formatPrettyDate = (date) =>
    date
        ? date.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric"
        })
        : "";

// Builds a real Date object for a stop's arrival/departure clock time,
// anchored to `baseDate` as the journey's Day-1 calendar date.
const buildStopDateTime = (baseDate, stop, field) => {
    if (!stop) return null;
    const minutes = parseTimeToMinutes(stop[field]);
    if (minutes === null) return null;
    const dayOffset = Math.max(0, (stop.day || 1) - 1);
    const dt = new Date(baseDate);
    dt.setDate(dt.getDate() + dayOffset);
    dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return dt;
};

const formatFare = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
};

/* ------------------------------ component ------------------------------ */

function TrainSchedule() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const trainParam = (searchParams.get("train") || "").trim();
    const dateParam = (searchParams.get("date") || "").trim();

    const [train, setTrain] = useState(null);
    const [loading, setLoading] = useState(Boolean(trainParam));
    const [error, setError] = useState("");

    const [manualQuery, setManualQuery] = useState(trainParam);

    const [checkDateKey, setCheckDateKey] = useState(dateParam || toDateKey(new Date()));
    const [stopFilter, setStopFilter] = useState("");

    const [fareFrom, setFareFrom] = useState("");
    const [fareTo, setFareTo] = useState("");

    const [favorited, setFavorited] = useState(false);
    const [copied, setCopied] = useState(false);
    const [shareNote, setShareNote] = useState("");

    const [now, setNow] = useState(new Date());
    const stopRefs = useRef({});

    const [showRouteMap, setShowRouteMap] = useState(false);
    const [isMapClosing, setIsMapClosing] = useState(false);

    // closes with a short fade/scale-out instead of unmounting instantly
    const closeRouteMap = useCallback(() => {
        setIsMapClosing(true);
        window.setTimeout(() => {
            setShowRouteMap(false);
            setIsMapClosing(false);
        }, 240);
    }, []);

    // lock page scroll and allow Escape to dismiss while the map is open
    useEffect(() => {
        if (!showRouteMap) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") closeRouteMap();
        };
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [showRouteMap, closeRouteMap]);

    // tick the clock every 30s so the live tracker stays accurate
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    // fetch the schedule whenever the train query param changes
    useEffect(() => {
        if (!trainParam) {
            setLoading(false);
            setTrain(null);
            setError("");
            return;
        }

        let active = true;
        setLoading(true);
        setError("");

        axios
            .get(`${API_BASE_URL}/trains/schedule`, { params: { q: trainParam } })
            .then((res) => {
                if (!active) return;
                setTrain(res.data?.train || null);
            })
            .catch((err) => {
                if (!active) return;
                setTrain(null);
                setError(
                    err.response?.data?.message ||
                    "Couldn't find a train matching your search. Please check the number or name and try again."
                );
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [trainParam]);

    // restore favorite state from localStorage for this train
    useEffect(() => {
        if (!train?.trainNumber) return;
        try {
            const saved = JSON.parse(window.localStorage.getItem("rb_favoriteTrains") || "[]");
            setFavorited(saved.includes(train.trainNumber));
        } catch {
            setFavorited(false);
        }
    }, [train?.trainNumber]);

    const route = useMemo(() => train?.route || [], [train?.route]);

    // reset fare-estimator endpoints whenever a new train loads
    useEffect(() => {
        const route = train?.route || [];
        if (route.length) {
            setFareFrom(route[0].stationCode);
            setFareTo(route[route.length - 1].stationCode);
        } else {
            setFareFrom("");
            setFareTo("");
        }
    }, [train?.route]);

    const toggleFavorite = () => {
        if (!train?.trainNumber) return;
        try {
            const saved = JSON.parse(window.localStorage.getItem("rb_favoriteTrains") || "[]");
            const next = favorited
                ? saved.filter((n) => n !== train.trainNumber)
                : [...saved, train.trainNumber];
            window.localStorage.setItem("rb_favoriteTrains", JSON.stringify(next));
            setFavorited(!favorited);
        } catch {
            setFavorited((f) => !f);
        }
    };

    const handleCopyNumber = async () => {
        if (!train?.trainNumber) return;
        try {
            await navigator.clipboard.writeText(train.trainNumber);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            // clipboard API unavailable — fail silently, non-critical
        }
    };

    const handleShare = async () => {
        if (!train) return;
        const shareData = {
            title: `${train.name} (${train.trainNumber})`,
            text: `${train.name} (${train.trainNumber}) — ${train.source?.stationName || ""} to ${train.destination?.stationName || ""
                }`,
            url: window.location.href
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch {
                // user dismissed the share sheet — nothing to do
            }
            return;
        }

        try {
            await navigator.clipboard.writeText(window.location.href);
            setShareNote("Link copied!");
            window.setTimeout(() => setShareNote(""), 1600);
        } catch {
            // ignore
        }
    };

    const handlePrint = () => window.print();

    const handleManualSearch = (event) => {
        event.preventDefault();
        if (!manualQuery.trim()) return;
        setSearchParams({ train: manualQuery.trim(), date: checkDateKey });
    };

    // const route = useMemo(() => train?.route || [], [train?.route]);

    const filteredRoute = useMemo(() => {
        const q = stopFilter.trim().toLowerCase();
        if (!q) return route;
        return route.filter(
            (stop) =>
                stop.stationName?.toLowerCase().includes(q) ||
                stop.stationCode?.toLowerCase().includes(q)
        );
    }, [route, stopFilter]);

    const checkDate = useMemo(() => fromDateKey(checkDateKey) || new Date(), [checkDateKey]);

    const runsOnCheckDate = useMemo(() => {
        if (!train?.runningDays?.length) return true;
        const weekday = WEEKDAYS_BY_INDEX[checkDate.getDay()];
        return train.runningDays.includes(weekday);
    }, [train, checkDate]);

    // live position, computed against the *real* current moment, using
    // checkDate as the journey's Day-1 calendar date
    const liveInfo = useMemo(() => {
        if (!route.length || !runsOnCheckDate) return null;

        const first = route[0];
        const last = route[route.length - 1];

        const departure = buildStopDateTime(checkDate, first, "departureTime");
        const arrival = buildStopDateTime(checkDate, last, "arrivalTime");

        if (!departure || !arrival) return null;

        if (now < departure) {
            return { status: "upcoming", departure, arrival };
        }
        if (now > arrival) {
            return { status: "completed", departure, arrival };
        }

        let fromStop = first;
        let toStop = last;

        for (let i = 0; i < route.length - 1; i++) {
            const legStart =
                buildStopDateTime(checkDate, route[i], "departureTime") ||
                buildStopDateTime(checkDate, route[i], "arrivalTime");
            const legEnd =
                buildStopDateTime(checkDate, route[i + 1], "arrivalTime") ||
                buildStopDateTime(checkDate, route[i + 1], "departureTime");

            if (legStart && legEnd && now >= legStart && now <= legEnd) {
                fromStop = route[i];
                toStop = route[i + 1];
                break;
            }
        }

        const legStart =
            buildStopDateTime(checkDate, fromStop, "departureTime") ||
            buildStopDateTime(checkDate, fromStop, "arrivalTime");
        const legEnd =
            buildStopDateTime(checkDate, toStop, "arrivalTime") ||
            buildStopDateTime(checkDate, toStop, "departureTime");

        let progress = 0;
        if (legStart && legEnd && legEnd > legStart) {
            progress = Math.min(1, Math.max(0, (now - legStart) / (legEnd - legStart)));
        }

        return { status: "running", departure, arrival, fromStop, toStop, progress };
    }, [route, checkDate, now, runsOnCheckDate]);

    const statusBanner = useMemo(() => {
        if (!train) return null;

        if (!runsOnCheckDate) {
            return {
                tone: "warn",
                icon: "fa-circle-exclamation",
                text: `${train.name} does not run on ${formatPrettyDate(checkDate)}.`
            };
        }
        if (!liveInfo) return null;

        if (liveInfo.status === "upcoming") {
            const diffMinutes = Math.round((liveInfo.departure - now) / 60000);
            return {
                tone: "info",
                icon: "fa-clock",
                text: `Departs from ${route[0]?.stationName} in ${formatDuration(diffMinutes)}.`
            };
        }
        if (liveInfo.status === "completed") {
            return {
                tone: "muted",
                icon: "fa-flag-checkered",
                text: `This journey has already reached ${route[route.length - 1]?.stationName}.`
            };
        }
        return {
            tone: "live",
            icon: "fa-train",
            text: `On the move — between ${liveInfo.fromStop.stationName} and ${liveInfo.toStop.stationName}.`
        };
    }, [train, runsOnCheckDate, liveInfo, checkDate, now, route]);

    const jumpToLive = () => {
        if (!liveInfo?.fromStop) return;
        setStopFilter("");
        window.setTimeout(() => {
            stopRefs.current[liveInfo.fromStop.stopNumber]?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 60);
    };

    const classes = train?.classes || [];

    const fareDistance = useMemo(() => {
        const a = route.find((s) => s.stationCode === fareFrom);
        const b = route.find((s) => s.stationCode === fareTo);
        if (!a || !b) return null;
        return Math.abs((b.distance || 0) - (a.distance || 0));
    }, [route, fareFrom, fareTo]);

    const totalStops = train?.totalStops ?? route.length;
    const totalHaltMinutes =
        train?.totalHaltMinutes ?? route.reduce((sum, s) => sum + (s.haltMinutes || 0), 0);

    const renderRatingStars = (rating = 0) => {
        const filled = Math.round(rating);
        return Array.from({ length: 5 }, (_, i) => (
            <i
                key={i}
                className={`fa-solid fa-star ${i < filled ? "is-filled" : "is-empty"}`}
            ></i>
        ));
    };

    /* ----------------------------- render states ----------------------------- */

    if (loading) {
        return (
            <JourneyLoader
                mode="overlay"
                title="Fetching train schedule"
                subtitle="Getting the live route, timings and seat classes."
            />
        );
    }

    if (!trainParam || error || !train) {
        return (
            <div className="schedule-page">
                <div className="schedule-overlay">
                    <div className="container">
                        <div className="ts-status-card">
                            <div className="ts-status-icon">
                                <i className={`fa-solid ${error ? "fa-train-subway" : "fa-magnifying-glass"}`}></i>
                            </div>

                            <h2>{error ? "Train not found" : "Look up a train schedule"}</h2>

                            <p>
                                {error ||
                                    "Enter a train number or name to see its full route, timings, classes and fares."}
                            </p>

                            <form className="ts-manual-search" onSubmit={handleManualSearch}>
                                <input
                                    type="text"
                                    className="form-control custom-input"
                                    placeholder="e.g. 12933 or Karnavati Express"
                                    value={manualQuery}
                                    onChange={(e) => setManualQuery(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="search-btn-custom ts-search-btn">
                                    Search
                                </button>
                            </form>

                            <button type="button" className="ts-link-btn" onClick={() => navigate("/")}>
                                <i className="fa-solid fa-arrow-left"></i> Back to home
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const origin = route[0];
    const destination = route[route.length - 1];

    return (
        <div className="schedule-page">
            <div className="schedule-overlay">
                <div className="container">
                    <button type="button" className="ts-back-link" onClick={() => navigate("/")}>
                        <i className="fa-solid fa-arrow-left"></i> Back to search
                    </button>

                    {/* ---------------- Hero header card ---------------- */}

                    <div className="ts-hero-card">
                        <div className="ts-hero-top">
                            <div className="ts-hero-id">
                                <span className="ts-train-number">#{train.trainNumber}</span>
                                <h1>{train.name}</h1>
                                <div className="ts-badge-row">
                                    <span className="ts-badge ts-badge-type">{train.trainType}</span>
                                    <span className={`ts-badge ts-badge-status ${train.status === "ACTIVE" ? "is-active" : "is-inactive"}`}>
                                        <i className="fa-solid fa-circle-check"></i>
                                        {train.status === "ACTIVE" ? "Active Service" : train.status}
                                    </span>
                                    {typeof train.rating === "number" && (
                                        <span className="ts-badge ts-badge-rating">
                                            {renderRatingStars(train.rating)}
                                            <span className="ts-rating-value">{train.rating.toFixed(1)}</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="ts-hero-actions">
                                <button
                                    type="button"
                                    className={`ts-icon-btn ${favorited ? "is-active" : ""}`}
                                    onClick={toggleFavorite}
                                    aria-label={favorited ? "Remove from saved trains" : "Save this train"}
                                    title={favorited ? "Saved" : "Save train"}
                                >
                                    <i className={`fa-${favorited ? "solid" : "regular"} fa-heart`}></i>
                                </button>

                                <button
                                    type="button"
                                    className="ts-icon-btn"
                                    onClick={handleCopyNumber}
                                    aria-label="Copy train number"
                                    title="Copy train number"
                                >
                                    <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`}></i>
                                </button>

                                <button
                                    type="button"
                                    className="ts-icon-btn"
                                    onClick={handleShare}
                                    aria-label="Share this schedule"
                                    title="Share"
                                >
                                    <i className="fa-solid fa-share-nodes"></i>
                                </button>

                                <button
                                    type="button"
                                    className="ts-icon-btn ts-print-btn"
                                    onClick={handlePrint}
                                    aria-label="Print schedule"
                                    title="Print"
                                >
                                    <i className="fa-solid fa-print"></i>
                                </button>

                                <button
                                    type="button"
                                    className="ts-icon-btn ts-map-btn"
                                    onClick={() => setShowRouteMap(true)}
                                    aria-label="View route on map"
                                    title="View route on map"
                                >
                                    <i className="fa-solid fa-map-location-dot"></i>
                                </button>
                            </div>
                        </div>

                        {shareNote && <div className="ts-toast">{shareNote}</div>}

                        <div className="ts-route-strip">
                            <div className="ts-route-point">
                                <span className="ts-route-time">{origin?.departureTime || "—"}</span>
                                <span className="ts-route-station">
                                    {origin?.stationName}
                                    <span className="ts-route-code">{origin?.stationCode}</span>
                                </span>
                            </div>

                            <div className="ts-route-track">
                                <i className="fa-solid fa-train ts-route-train-icon"></i>
                            </div>

                            <div className="ts-route-point is-end">
                                <span className="ts-route-time">{destination?.arrivalTime || "—"}</span>
                                <span className="ts-route-station">
                                    {destination?.stationName}
                                    <span className="ts-route-code">{destination?.stationCode}</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ---------------- Stat cards ---------------- */}

                    <div className="ts-stats-grid">
                        <div className="ts-stat-card">
                            <i className="fa-solid fa-road"></i>
                            <span className="ts-stat-value">{train.distance ?? "—"} km</span>
                            <span className="ts-stat-label">Total Distance</span>
                        </div>
                        <div className="ts-stat-card">
                            <i className="fa-solid fa-hourglass-half"></i>
                            <span className="ts-stat-value">{train.duration || "—"}</span>
                            <span className="ts-stat-label">Journey Time</span>
                        </div>
                        <div className="ts-stat-card">
                            <i className="fa-solid fa-gauge-high"></i>
                            <span className="ts-stat-value">{train.averageSpeed ?? "—"} km/h</span>
                            <span className="ts-stat-label">Average Speed</span>
                        </div>
                        <div className="ts-stat-card">
                            <i className="fa-solid fa-location-dot"></i>
                            <span className="ts-stat-value">{totalStops}</span>
                            <span className="ts-stat-label">Total Stops</span>
                        </div>
                        <div className="ts-stat-card">
                            <i className="fa-solid fa-circle-pause"></i>
                            <span className="ts-stat-value">{formatDuration(totalHaltMinutes)}</span>
                            <span className="ts-stat-label">Total Halt Time</span>
                        </div>
                    </div>

                    {/* ---------------- Running days + live status ---------------- */}

                    <div className="ts-panel">
                        <div className="ts-panel-header">
                            <h3><i className="fa-solid fa-calendar-week"></i> Running Days</h3>
                        </div>

                        <div className="ts-days-row">
                            {WEEKDAYS_DISPLAY.map((day) => {
                                const active = train.runningDays?.includes(day);
                                const isChecked = WEEKDAYS_BY_INDEX[checkDate.getDay()] === day;
                                return (
                                    <span
                                        key={day}
                                        className={`ts-day-chip ${active ? "is-active" : "is-inactive"} ${isChecked ? "is-checked" : ""
                                            }`}
                                    >
                                        {day}
                                    </span>
                                );
                            })}
                        </div>

                        <div className="ts-date-check-row">
                            <label htmlFor="ts-check-date" className="hero-label">
                                Check running status for
                            </label>
                            <input
                                id="ts-check-date"
                                type="date"
                                className="form-control custom-input ts-date-input"
                                value={checkDateKey}
                                onChange={(e) => setCheckDateKey(e.target.value || toDateKey(new Date()))}
                            />
                        </div>

                        {statusBanner && (
                            <div className={`ts-status-banner ts-tone-${statusBanner.tone}`}>
                                <i className={`fa-solid ${statusBanner.icon}`}></i>
                                <span>{statusBanner.text}</span>
                                {statusBanner.tone === "live" && (
                                    <button type="button" className="ts-link-btn ts-jump-btn" onClick={jumpToLive}>
                                        Locate on route <i className="fa-solid fa-arrow-down"></i>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ---------------- Facilities ---------------- */}

                    <div className="ts-panel">
                        <div className="ts-panel-header">
                            <h3><i className="fa-solid fa-screwdriver-wrench"></i> Onboard Facilities</h3>
                        </div>

                        <div className="ts-facilities-grid">
                            {Object.entries(FACILITY_META).map(([key, meta]) => {
                                const available = Boolean(train.facilities?.[key]);
                                return (
                                    <div
                                        key={key}
                                        className={`ts-facility-pill ${available ? "is-available" : "is-unavailable"}`}
                                    >
                                        <i className={`fa-solid ${meta.icon}`}></i>
                                        <span>{meta.label}</span>
                                        <i className={`fa-solid ${available ? "fa-check" : "fa-xmark"} ts-facility-state`}></i>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ---------------- Classes & fare estimator ---------------- */}

                    <div className="ts-panel">
                        <div className="ts-panel-header">
                            <h3><i className="fa-solid fa-chair"></i> Classes &amp; Fare Estimator</h3>
                        </div>

                        <div className="ts-classes-table-wrap">
                            <table className="ts-classes-table">
                                <thead>
                                    <tr>
                                        <th>Class</th>
                                        <th>Fare / km</th>
                                        <th>Total Seats</th>
                                        <th>Estimated Fare</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classes.map((cls) => (
                                        <tr key={cls.code}>
                                            <td>
                                                <span className="ts-class-name">{cls.name}</span>
                                                <span className="ts-class-code">{cls.code}</span>
                                            </td>
                                            <td>₹{cls.farePerKm}</td>
                                            <td>{cls.totalSeats}</td>
                                            <td className="ts-fare-cell">
                                                {fareDistance !== null
                                                    ? formatFare(fareDistance * cls.farePerKm)
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="ts-fare-picker">
                            <div className="ts-fare-field">
                                <label className="hero-label" htmlFor="fare-from">Boarding at</label>
                                <select
                                    id="fare-from"
                                    className="form-select custom-input"
                                    value={fareFrom}
                                    onChange={(e) => setFareFrom(e.target.value)}
                                >
                                    {route.map((s) => (
                                        <option key={s.stationCode} value={s.stationCode}>
                                            {s.stationName} ({s.stationCode})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <i className="fa-solid fa-arrow-right-long ts-fare-arrow"></i>

                            <div className="ts-fare-field">
                                <label className="hero-label" htmlFor="fare-to">Alighting at</label>
                                <select
                                    id="fare-to"
                                    className="form-select custom-input"
                                    value={fareTo}
                                    onChange={(e) => setFareTo(e.target.value)}
                                >
                                    {route.map((s) => (
                                        <option key={s.stationCode} value={s.stationCode}>
                                            {s.stationName} ({s.stationCode})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="field-helper ts-fare-helper">
                            {fareFrom === fareTo
                                ? "Choose two different stations to estimate fare."
                                : `Distance for this leg: ${fareDistance} km`}
                        </div>
                    </div>

                    {/* ---------------- Stops timeline ---------------- */}

                    <div className="ts-panel">
                        <div className="ts-panel-header ts-panel-header-row">
                            <h3><i className="fa-solid fa-route"></i> Route &amp; Stops</h3>

                            <div className="ts-stop-search">
                                <i className="fa-solid fa-magnifying-glass"></i>
                                <input
                                    type="text"
                                    placeholder="Filter by station name or code"
                                    value={stopFilter}
                                    onChange={(e) => setStopFilter(e.target.value)}
                                />
                                {stopFilter && (
                                    <button
                                        type="button"
                                        className="ts-clear-filter"
                                        onClick={() => setStopFilter("")}
                                        aria-label="Clear filter"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        {stopFilter && (
                            <div className="field-helper">
                                Showing {filteredRoute.length} of {route.length} stops
                            </div>
                        )}

                        <ul className="ts-timeline">
                            {filteredRoute.map((stop) => {
                                const isOrigin = stop.isOrigin ?? stop.stopNumber === origin?.stopNumber;
                                const isDestination =
                                    stop.isDestination ?? stop.stopNumber === destination?.stopNumber;
                                const isLiveCurrent =
                                    liveInfo?.status === "running" && stop === liveInfo.fromStop;
                                const isLiveNext =
                                    liveInfo?.status === "running" && stop === liveInfo.toStop;

                                return (
                                    <li
                                        key={stop.stopNumber}
                                        ref={(el) => (stopRefs.current[stop.stopNumber] = el)}
                                        className={`ts-stop ${isOrigin ? "is-origin" : ""} ${isDestination ? "is-destination" : ""
                                            } ${isLiveCurrent ? "is-live-current" : ""} ${isLiveNext ? "is-live-next" : ""}`}
                                    >
                                        <div className="ts-stop-marker">
                                            <span className="ts-stop-dot">
                                                {isOrigin && <i className="fa-solid fa-circle-dot"></i>}
                                                {isDestination && <i className="fa-solid fa-flag-checkered"></i>}
                                                {!isOrigin && !isDestination && <i className="fa-solid fa-circle"></i>}
                                            </span>
                                            <span className="ts-stop-line"></span>
                                        </div>

                                        <div className="ts-stop-body">
                                            <div className="ts-stop-top-row">
                                                <span className="ts-stop-name">
                                                    {stop.stationName}
                                                    <span className="ts-stop-code">{stop.stationCode}</span>
                                                </span>

                                                {stop.day > 1 && (
                                                    <span className="ts-day-tag">Day {stop.day}</span>
                                                )}
                                            </div>

                                            <div className="ts-stop-meta-row">
                                                <span>
                                                    <i className="fa-solid fa-right-to-bracket"></i>{" "}
                                                    {stop.arrivalTime || "Source"}
                                                </span>
                                                <span>
                                                    <i className="fa-solid fa-right-from-bracket"></i>{" "}
                                                    {stop.departureTime || "Terminates"}
                                                </span>
                                                <span>
                                                    <i className="fa-solid fa-road"></i> {stop.distance} km
                                                </span>
                                                {stop.haltMinutes ? (
                                                    <span className="ts-halt-pill">
                                                        Halt: {formatDuration(stop.haltMinutes)}
                                                    </span>
                                                ) : null}
                                            </div>

                                            {isLiveCurrent && liveInfo?.toStop && (
                                                <div className="ts-live-progress">
                                                    <div className="ts-live-track">
                                                        <div
                                                            className="ts-live-fill"
                                                            style={{ width: `${Math.round(liveInfo.progress * 100)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="ts-live-caption">
                                                        <i className="fa-solid fa-train ts-live-pulse"></i>
                                                        Train is here, heading to {liveInfo.toStop.stationName}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}

                            {filteredRoute.length === 0 && (
                                <li className="ts-stop-empty">No stops match “{stopFilter}”.</li>
                            )}
                        </ul>
                    </div>

                    <div className="ts-footer-actions">
                        <button type="button" className="ts-link-btn" onClick={() => navigate("/")}>
                            <i className="fa-solid fa-magnifying-glass"></i> Search another train
                        </button>
                    </div>
                </div>
            </div>
            {showRouteMap && (
                <div className={`ts-map-modal ${isMapClosing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Train route map">

                    <div className="ts-map-backdrop"
                        onClick={closeRouteMap}
                    ></div>

                    <div className="ts-map-container">

                        <div className="ts-map-header">

                            <div>

                                <h3>
                                    <i className="fa-solid fa-map-location-dot"></i>
                                    Train Route Map
                                </h3>

                                <p>
                                    {train.trainNumber} • {train.name}
                                </p>

                            </div>

                            <button
                                type="button"
                                onClick={closeRouteMap}
                                className="ts-map-close"
                                aria-label="Close map"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>

                        </div>

                        <div className="ts-map-info">

                            <div>

                                <span>From</span>

                                <h5>{origin.stationName}</h5>

                            </div>

                            <i className="fa-solid fa-arrow-right"></i>

                            <div>

                                <span>To</span>

                                <h5>{destination.stationName}</h5>

                            </div>

                        </div>

                        <div className="ts-map-wrapper">

                            <TrainRouteMap
                                route={route}
                                trainNumber={train.trainNumber}
                                liveInfo={liveInfo}
                            />

                        </div>

                        <div className="ts-map-footer">

                            <div>

                                <i className="fa-solid fa-road"></i>

                                <strong>{train.distance} km</strong>

                                <span>Distance</span>

                            </div>

                            <div>

                                <i className="fa-solid fa-location-dot"></i>

                                <strong>{route.length}</strong>

                                <span>Stations</span>

                            </div>

                            <div>

                                <i className="fa-solid fa-clock"></i>

                                <strong>{train.duration}</strong>

                                <span>Journey</span>

                            </div>

                            <div>

                                <i className="fa-solid fa-calendar"></i>

                                <strong>{train.runningDays.length}</strong>

                                <span>Running Days</span>

                            </div>

                        </div>

                    </div>

                </div>
            )}
        </div>
    );
}

export default TrainSchedule;