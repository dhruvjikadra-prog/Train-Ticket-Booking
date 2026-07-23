import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faArrowsRotate,
    faBars,
    faCalendarDays,
    faCircleCheck,
    faFloppyDisk,
    faHouse,
    faListCheck,
    faMagnifyingGlass,
    faMoon,
    faRightFromBracket,
    faShieldHalved,
    faSpinner,
    faSun,
    faTrain,
    faTriangleExclamation,
    faUser,
    faXmark,
    faListUl
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminAddTrain.css";
import "../Styles/AdminReleaseSeats.css";
import RailGo from "../Assets/logo.png";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const TRAIN_API_BASE = `${API_BASE_URL}/trains`;
const SEAT_API_BASE = `${API_BASE_URL}/seats`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const trainApi = axios.create({ baseURL: TRAIN_API_BASE, withCredentials: true });
const seatApi = axios.create({ baseURL: SEAT_API_BASE, withCredentials: true });

const WEEKDAYS_BY_INDEX = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COACH_CAPACITY = {
    SL: 72,
    "3A": 64,
    "2A": 46,
    "1A": 18,
    CC: 78,
    EC: 56
};

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function fromDateKey(value) {
    const parts = String(value || "").split("-").map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    if (
        date.getFullYear() !== parts[0] ||
        date.getMonth() !== parts[1] - 1 ||
        date.getDate() !== parts[2]
    ) {
        return null;
    }

    return date;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

function AdminReleaseSeats() {
    const navigate = useNavigate();
    const todayKey = useMemo(() => toDateKey(new Date()), []);

    const [admin, setAdmin] = useState(null);
    const [query, setQuery] = useState("");
    const [selectedTrain, setSelectedTrain] = useState(null);
    const [journeyDate, setJourneyDate] = useState(todayKey);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [success, setSuccess] = useState("");
    const [releaseResult, setReleaseResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [trainLoading, setTrainLoading] = useState(false);
    const [trainSuggestions, setTrainSuggestions] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState("");
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    useEffect(() => {
        const favicon = document.querySelector("link[rel='icon']");

        if (favicon) {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
        }

        document.title = "Train Booking - Admin Release Seats";

        return () => {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
            document.title = "Train Booking";
        };
    }, []);

    const verifyAdmin = useCallback(async () => {
        setLoading(true);

        try {
            const response = await authApi.get("/me");
            setAdmin(response.data.admin);
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    const response = await authApi.get("/me");
                    setAdmin(response.data.admin);
                } catch {
                    navigate("/admin-login", { replace: true });
                }
            } else {
                setFormError(err.response?.data?.message || "Admin session is not available right now.");
            }
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        verifyAdmin();
    }, [verifyAdmin]);

    useEffect(() => {
        localStorage.setItem("admin-dashboard-theme", theme);
    }, [theme]);

    useEffect(() => {
        const searchText = query.trim();

        if (!searchText || searchText.length < 2 || selectedTrain) {
            setTrainSuggestions([]);
            setSuggestionsError("");
            setSuggestionsLoading(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSuggestionsLoading(true);
            setSuggestionsError("");

            try {
                const response = await trainApi.get("/suggestions", {
                    params: { q: searchText },
                    signal: controller.signal
                });

                setTrainSuggestions(response.data.trains || []);
            } catch (err) {
                if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
                    return;
                }

                setTrainSuggestions([]);
                setSuggestionsError("Suggestions unavailable.");
            } finally {
                if (!controller.signal.aborted) {
                    setSuggestionsLoading(false);
                }
            }
        }, 250);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query, selectedTrain]);

    const navItems = [
        { label: "Dashboard", to: "/admin/dashboard", icon: faHouse },
        { label: "All Trains", to: "/admin/trains", icon: faListUl},
        { label: "Add Train", to: "/admin/trains/add", icon: faTrain },
        { label: "Add Journey + Seats", to: "/admin/release-seats", icon: faCalendarDays, active: true }
    ];

    const selectedDate = useMemo(() => fromDateKey(journeyDate), [journeyDate]);
    const selectedWeekday = selectedDate ? WEEKDAYS_BY_INDEX[selectedDate.getDay()] : "";
    const runsOnSelectedDate = useMemo(() => {
        if (!selectedTrain || !selectedWeekday) return true;
        if (!selectedTrain.runningDays?.length) return true;

        return selectedTrain.runningDays.includes(selectedWeekday);
    }, [selectedTrain, selectedWeekday]);

    const releasePlan = useMemo(() => {
        return (selectedTrain?.classes || []).map((item) => {
            const totalSeats = Number(item.totalSeats || 0);
            const coachSize = COACH_CAPACITY[item.code] || totalSeats || 1;

            return {
                ...item,
                totalSeats,
                coachCount: Math.ceil(totalSeats / coachSize)
            };
        });
    }, [selectedTrain]);

    const validate = () => {
        const errors = {};
        const parsedDate = fromDateKey(journeyDate);

        if (!selectedTrain?._id) {
            errors.train = "Load a train before releasing seats.";
        }

        if (!parsedDate) {
            errors.journeyDate = "Select a valid journey date.";
        } else if (journeyDate < todayKey) {
            errors.journeyDate = "Journey date cannot be in the past.";
        } else if (!runsOnSelectedDate) {
            errors.journeyDate = `${selectedTrain.name} does not run on this date.`;
        }

        if (selectedTrain && selectedTrain.status !== "ACTIVE") {
            errors.train = "Only active trains can be released.";
        }

        if (selectedTrain && releasePlan.length === 0) {
            errors.train = "This train has no configured classes.";
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const loadTrain = useCallback(async (searchText) => {
        const normalizedSearch = searchText.trim();

        if (!normalizedSearch) {
            setFieldErrors({ trainSearch: "Enter a train number or name." });
            return;
        }

        setTrainLoading(true);
        setFormError("");
        setSuccess("");
        setReleaseResult(null);
        setFieldErrors({});
        setSuggestionsOpen(false);
        setSuggestionsError("");

        try {
            const response = await trainApi.get("/schedule", {
                params: { q: normalizedSearch }
            });

            setSelectedTrain(response.data.train);
            setQuery(`${response.data.train.trainNumber} - ${response.data.train.name}`);
            setTrainSuggestions([]);
        } catch (err) {
            setSelectedTrain(null);
            setFormError(err.response?.data?.message || "Train could not be loaded.");
        } finally {
            setTrainLoading(false);
        }
    }, []);

    const handleLoadTrain = async (event) => {
        event.preventDefault();
        await loadTrain(query);
    };

    const handleSelectSuggestion = async (train) => {
        setQuery(`${train.number} - ${train.name}`);
        await loadTrain(train.number);
    };

    const submitRelease = async () => {
        const csrfRes = await authApi.get("/csrf-token");

        return seatApi.post(
            "/release-journey",
            {
                trainId: selectedTrain._id,
                journeyDate
            },
            {
                headers: {
                    "X-CSRF-Token": csrfRes.data.csrfToken
                }
            }
        );
    };

    const handleRelease = async (event) => {
        event.preventDefault();
        if (saving) return;

        setFormError("");
        setSuccess("");
        setReleaseResult(null);

        if (!validate()) {
            setFormError("Please fix the highlighted fields.");
            return;
        }

        setSaving(true);

        try {
            const response = await submitRelease();
            setReleaseResult(response.data);
            setSuccess(response.data.message || "Seats released successfully.");
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    const response = await submitRelease();
                    setReleaseResult(response.data);
                    setSuccess(response.data.message || "Seats released successfully.");
                } catch (refreshErr) {
                    if (refreshErr.response?.status === 401) {
                        navigate("/admin-login", { replace: true });
                    } else {
                        setFormError(refreshErr.response?.data?.message || "Seats could not be released.");
                    }
                }
            } else {
                setFormError(err.response?.data?.message || "Seats could not be released.");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = async () => {
        try {
            const csrfRes = await authApi.get("/csrf-token");
            await authApi.post(
                "/logout",
                {},
                { headers: { "X-CSRF-Token": csrfRes.data.csrfToken } }
            );
        } finally {
            navigate("/admin-login", { replace: true });
        }
    };

    return (
        <div className={`ad-page ${theme === "dark" ? "ad-dark" : ""}`}>
            {sidebarOpen && (
                <button
                    className="ad-sidebar-scrim"
                    type="button"
                    aria-label="Close sidebar"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={`ad-sidebar ${sidebarOpen ? "is-open" : ""}`}>
                <div className="ad-brand">
                    <img src={RailGo} alt="" className="aat-brand-logo" />
                    <div>
                        <strong>Rail Admin</strong>
                        <span>Control Center</span>
                    </div>
                    <button
                        className="ad-sidebar-close"
                        type="button"
                        aria-label="Close sidebar"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                    </button>
                </div>

                <nav className="ad-nav aat-nav" aria-label="Admin navigation">
                    {navItems.map((item) => {
                        // const Icon = item.icon;

                        return (
                            <Link
                                key={item.label}
                                to={item.to}
                                className={item.active ? "is-active" : ""}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <FontAwesomeIcon icon={item.icon} style={{ fontSize: 18 }} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="ad-admin-card">
                    <div className="ad-admin-avatar">
                        <FontAwesomeIcon icon={faUser} style={{ fontSize: 20 }} />
                    </div>
                    <div>
                        <strong>{admin?.name || "Admin"}</strong>
                        <span>{admin?.role || "admin"}</span>
                    </div>
                </div>
            </aside>

            <main className="ad-main">
                <header className="ad-topbar">
                    <div className="ad-title-wrap">
                        <button
                            className="ad-icon-btn ad-menu-btn"
                            type="button"
                            aria-label="Open sidebar"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <FontAwesomeIcon icon={faBars} style={{ fontSize: 20 }} />
                        </button>
                        <div>
                            <span className="ad-kicker">Inventory</span>
                            <h1>Release Seats</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <Link className="aat-back-link" to="/admin/dashboard">
                            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 18 }} />
                            <span>Dashboard</span>
                        </Link>
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Theme"
                            aria-label="Toggle theme"
                            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
                        >
                            {theme === "dark" ? <FontAwesomeIcon icon={faSun} style={{ fontSize: 19 }} /> : <FontAwesomeIcon icon={faMoon} style={{ fontSize: 19 }} />}
                        </button>
                        <button className="ad-logout" type="button" onClick={handleLogout}>
                            <FontAwesomeIcon icon={faRightFromBracket} style={{ fontSize: 18 }} />
                            <span>Sign out</span>
                        </button>
                    </div>
                </header>

                {loading ? (
                    <section className="ad-loading" aria-live="polite">
                        <FontAwesomeIcon icon={faShieldHalved} style={{ fontSize: 30 }} />
                        <span>Checking admin session</span>
                    </section>
                ) : (
                    <div className="ad-content aat-content">
                        {formError && (
                            <div className="ad-alert" role="alert">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                                <span>{formError}</span>
                            </div>
                        )}

                        {success && (
                            <div className="aat-success" role="status">
                                <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 18 }} />
                                <span>{success}</span>
                            </div>
                        )}

                        <form className="aat-form" onSubmit={handleRelease} noValidate>
                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Train</span>
                                        <h3>Train Lookup</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ars-lookup-row">
                                    <label className="aat-field ars-suggestion-field">
                                        <span>Train Number Or Name</span>
                                        <div className="ars-suggestion-wrap">
                                            <input
                                                type="text"
                                                value={query}
                                                autoComplete="off"
                                                role="combobox"
                                                aria-expanded={suggestionsOpen}
                                                aria-controls="ars-train-suggestions"
                                                onFocus={() => setSuggestionsOpen(true)}
                                                onBlur={() => {
                                                    window.setTimeout(() => setSuggestionsOpen(false), 120);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        event.preventDefault();
                                                        loadTrain(event.currentTarget.value);
                                                    }
                                                }}
                                                onChange={(event) => {
                                                    setQuery(event.target.value);
                                                    setSelectedTrain(null);
                                                    setReleaseResult(null);
                                                    setSuggestionsOpen(true);
                                                    setFieldErrors((errors) => ({
                                                        ...errors,
                                                        trainSearch: "",
                                                        train: ""
                                                    }));
                                                }}
                                                aria-invalid={Boolean(fieldErrors.trainSearch || fieldErrors.train)}
                                            />

                                            {suggestionsOpen && query.trim().length >= 2 && !selectedTrain && (
                                                <div
                                                    id="ars-train-suggestions"
                                                    className="ars-suggestion-menu"
                                                    role="listbox"
                                                >
                                                    {suggestionsLoading && (
                                                        <div className="ars-suggestion-state">
                                                            <FontAwesomeIcon icon={faSpinner} className="ad-spin" style={{ fontSize: 14 }} />
                                                            <span>Searching trains</span>
                                                        </div>
                                                    )}

                                                    {!suggestionsLoading && suggestionsError && (
                                                        <div className="ars-suggestion-state is-error">
                                                            <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 14 }} />
                                                            <span>{suggestionsError}</span>
                                                        </div>
                                                    )}

                                                    {!suggestionsLoading && !suggestionsError && trainSuggestions.length === 0 && (
                                                        <div className="ars-suggestion-state">
                                                            <span>No active train found</span>
                                                        </div>
                                                    )}

                                                    {!suggestionsLoading && !suggestionsError && trainSuggestions.map((train) => (
                                                        <button
                                                            key={train.number}
                                                            type="button"
                                                            className="ars-suggestion-option"
                                                            role="option"
                                                            aria-selected="false"
                                                            onMouseDown={(event) => event.preventDefault()}
                                                            onClick={() => handleSelectSuggestion(train)}
                                                        >
                                                            <strong>{train.number} - {train.name}</strong>
                                                            <span>{train.from} to {train.to}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {fieldErrors.trainSearch && (
                                            <span className="aat-field-error">{fieldErrors.trainSearch}</span>
                                        )}
                                    </label>

                                    <button
                                        className="ars-load-btn"
                                        type="button"
                                        onClick={handleLoadTrain}
                                        disabled={trainLoading}
                                    >
                                        {trainLoading ? <FontAwesomeIcon icon={faSpinner} className="ad-spin" style={{ fontSize: 18 }} /> : <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 18 }} />}
                                        <span>{trainLoading ? "Loading" : "Load"}</span>
                                    </button>
                                </div>

                                {fieldErrors.train && <span className="aat-field-error">{fieldErrors.train}</span>}

                                {selectedTrain && (
                                    <div className="ars-train-card">
                                        <div>
                                            <span className="ars-train-number">{selectedTrain.trainNumber}</span>
                                            <h4>{selectedTrain.name}</h4>
                                            <p>
                                                {selectedTrain.source?.stationName} to {selectedTrain.destination?.stationName}
                                            </p>
                                        </div>
                                        <span className={`ars-status ${selectedTrain.status === "ACTIVE" ? "is-active" : "is-inactive"}`}>
                                            {selectedTrain.status}
                                        </span>
                                    </div>
                                )}
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Journey</span>
                                        <h3>Journey Date</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 20 }} />
                                </div>

                                <div className="aat-grid three">
                                    <label className="aat-field">
                                        <span>Date</span>
                                        <input
                                            type="date"
                                            min={todayKey}
                                            value={journeyDate}
                                            onChange={(event) => {
                                                setJourneyDate(event.target.value);
                                                setReleaseResult(null);
                                            }}
                                            aria-invalid={Boolean(fieldErrors.journeyDate)}
                                        />
                                        {fieldErrors.journeyDate && (
                                            <span className="aat-field-error">{fieldErrors.journeyDate}</span>
                                        )}
                                    </label>

                                    <div className="ars-date-panel">
                                        <span>Day</span>
                                        <strong>{selectedWeekday || "-"}</strong>
                                    </div>

                                    <div className={`ars-date-panel ${runsOnSelectedDate ? "is-ok" : "is-warning"}`}>
                                        <span>Status</span>
                                        <strong>{runsOnSelectedDate ? "Runnable" : "Not Running"}</strong>
                                    </div>
                                </div>
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Seats</span>
                                        <h3>Class Release Plan</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faListCheck} style={{ fontSize: 20 }} />
                                </div>

                                {releasePlan.length ? (
                                    <div className="ars-class-grid">
                                        {releasePlan.map((item) => (
                                            <article className="ars-class-card" key={item.code}>
                                                <span>{item.code}</span>
                                                <strong>{item.name}</strong>
                                                <div>
                                                    <small>Seats</small>
                                                    <b>{formatNumber(item.totalSeats)}</b>
                                                </div>
                                                <div>
                                                    <small>Coaches</small>
                                                    <b>{formatNumber(item.coachCount)}</b>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="ad-empty">Load a train to view classes</div>
                                )}
                            </section>

                            {releaseResult?.classes?.length ? (
                                <section className="ad-panel aat-panel">
                                    <div className="ad-panel-head">
                                        <div>
                                            <span className="ad-kicker">Released</span>
                                            <h3>Release Summary</h3>
                                        </div>
                                        <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 20 }} />
                                    </div>

                                    <div className="ars-result-grid">
                                        {releaseResult.classes.map((item) => (
                                            <article className="ars-result-card" key={item.code}>
                                                <span>{item.code}</span>
                                                <strong>{formatNumber(item.availableSeats)}</strong>
                                                <small>
                                                    {formatNumber(item.coachCount)} coaches, {formatNumber(item.releasedSeats)} seats
                                                </small>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            <div className="aat-submit-bar">
                                <button
                                    className="aat-secondary"
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        setSelectedTrain(null);
                                        setReleaseResult(null);
                                        setSuccess("");
                                        setFormError("");
                                        setFieldErrors({});
                                    }}
                                    disabled={saving}
                                >
                                    <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                                    <span>Clear</span>
                                </button>
                                <button className="aat-primary" type="submit" disabled={saving || trainLoading}>
                                    {saving ? <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 18 }} /> : <FontAwesomeIcon icon={faFloppyDisk} style={{ fontSize: 18 }} />}
                                    <span>{saving ? "Releasing" : "Release Seats"}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
}

export default AdminReleaseSeats;
