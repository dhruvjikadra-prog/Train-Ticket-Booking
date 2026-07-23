import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faBars,
    faCircleCheck,
    faClock,
    faFloppyDisk,
    faHouse,
    faListUl,
    faMoon,
    faPlus,
    faRightFromBracket,
    faShieldHalved,
    faSquarePlus,
    faSun,
    faTrain,
    faTrashCan,
    faTriangleExclamation,
    faUser,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminAddTrain.css";
import RailGo from "../Assets/logo.png";
import StationFieldPair from "../Components/StationFieldPair";
import {
    DAYS,
    CLASS_OPTIONS,
    TRAIN_TYPES,
    FACILITIES,
    initialTrainForm,
    titleForClass,
    normalizeCode,
    errorFor as errorMessageFor,
    validateTrainForm,
    buildTrainPayload,
    computeAverageSpeed
} from "../Components/TrainFormedShared";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const TRAIN_API_BASE = `${API_BASE_URL}/trains`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const trainApi = axios.create({ baseURL: TRAIN_API_BASE, withCredentials: true });

function errorFor(errors, key) {
    const message = errorMessageFor(errors, key);
    return message ? <span className="aat-field-error">{message}</span> : null;
}

function AdminAddTrain() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [form, setForm] = useState(initialTrainForm);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    useEffect(() => {
        const favicon = document.querySelector("link[rel='icon']");

        if (favicon) {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
        }

        document.title = "Train Booking - Admin Trains";

        return () => {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
            document.title = "Train Booking";
        };
    }, []);

    const averageSpeed = useMemo(() => computeAverageSpeed(form), [form]);

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

    const navItems = [
        { label: "Dashboard", to: "/admin/dashboard", icon: faHouse },
        { label: "All Trains", to: "/admin/trains", icon: faListUl },
        { label: "Add Train", to: "/admin/trains/add", icon: faTrain, active: true },
        { label: "Add Journey + Seats", to: "/admin/release-seats", icon: faSquarePlus }
    ];

    const setValue = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const setFacility = (key, value) => {
        setForm((current) => ({
            ...current,
            facilities: {
                ...current.facilities,
                [key]: value
            }
        }));
    };

    const toggleRunningDay = (day) => {
        setForm((current) => {
            const hasDay = current.runningDays.includes(day);

            return {
                ...current,
                runningDays: hasDay
                    ? current.runningDays.filter((item) => item !== day)
                    : DAYS.filter((item) => [...current.runningDays, day].includes(item))
            };
        });
    };

    const updateClass = (index, key, value) => {
        setForm((current) => {
            const classes = current.classes.map((item, itemIndex) => {
                if (itemIndex !== index) return item;

                if (key === "code") {
                    return {
                        ...item,
                        code: value,
                        name: titleForClass(value)
                    };
                }

                return {
                    ...item,
                    [key]: value
                };
            });

            return { ...current, classes };
        });
    };

    const addClass = () => {
        setForm((current) => ({
            ...current,
            classes: [
                ...current.classes,
                {
                    code: "",
                    name: "",
                    farePerKm: "",
                    totalSeats: ""
                }
            ]
        }));
    };

    const removeClass = (index) => {
        setForm((current) => ({
            ...current,
            classes: current.classes.filter((_, itemIndex) => itemIndex !== index)
        }));
    };

    const updateStop = (index, key, value) => {
        setForm((current) => ({
            ...current,
            stops: current.stops.map((stop, stopIndex) => (
                stopIndex === index ? { ...stop, [key]: value } : stop
            ))
        }));
    };

    const selectStopStation = (index, station) => {
        setForm((current) => ({
            ...current,
            stops: current.stops.map((stop, stopIndex) => (
                stopIndex === index
                    ? { ...stop, stationCode: station.code, stationName: station.name }
                    : stop
            ))
        }));
    };

    const addStop = () => {
        setForm((current) => ({
            ...current,
            stops: [
                ...current.stops,
                {
                    stationCode: "",
                    stationName: "",
                    arrivalTime: "",
                    departureTime: "",
                    distance: "",
                    day: "1"
                }
            ]
        }));
    };

    const removeStop = (index) => {
        setForm((current) => ({
            ...current,
            stops: current.stops.filter((_, stopIndex) => stopIndex !== index)
        }));
    };

    const buildPayload = () => buildTrainPayload(form);

    const submitCreateTrain = async (payload) => {
        const csrfRes = await authApi.get("/csrf-token");
        return trainApi.post("/", payload, {
            headers: {
                "X-CSRF-Token": csrfRes.data.csrfToken
            }
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (saving) return;

        setSuccess("");
        setFormError("");

        const errors = validateTrainForm(form);
        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            setFormError("Please fix the highlighted fields.");
            return;
        }

        const payload = buildPayload();
        setSaving(true);

        try {
            const response = await submitCreateTrain(payload);
            setSuccess(response.data.message || "Train added successfully.");
            setForm(initialTrainForm);
            setFieldErrors({});
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    const response = await submitCreateTrain(payload);
                    setSuccess(response.data.message || "Train added successfully.");
                    setForm(initialTrainForm);
                    setFieldErrors({});
                } catch (refreshErr) {
                    if (refreshErr.response?.status === 401) {
                        navigate("/admin-login", { replace: true });
                    } else {
                        setFormError(refreshErr.response?.data?.message || "Train could not be saved.");
                    }
                }
            } else {
                const serverErrors = err.response?.data?.errors;
                setFormError(
                    Array.isArray(serverErrors) && serverErrors.length
                        ? serverErrors[0]
                        : err.response?.data?.message || "Train could not be saved."
                );
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
                            <h1>Add Train</h1>
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

                        <form className="aat-form" onSubmit={handleSubmit} noValidate>
                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Core Details</span>
                                        <h3>Train Identity</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faTrain} style={{ fontSize: 20 }} />
                                </div>

                                <div className="aat-grid three">
                                    <label className="aat-field">
                                        <span>Train Number</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={5}
                                            value={form.trainNumber}
                                            onChange={(event) => setValue("trainNumber", event.target.value.replace(/\D/g, "").slice(0, 5))}
                                            aria-invalid={Boolean(fieldErrors.trainNumber)}
                                        />
                                        {errorFor(fieldErrors, "trainNumber")}
                                    </label>

                                    <label className="aat-field aat-field-wide">
                                        <span>Train Name</span>
                                        <input
                                            type="text"
                                            maxLength={100}
                                            value={form.name}
                                            onChange={(event) => setValue("name", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.name)}
                                        />
                                        {errorFor(fieldErrors, "name")}
                                    </label>

                                    <label className="aat-field">
                                        <span>Train Type</span>
                                        <select
                                            value={form.trainType}
                                            onChange={(event) => setValue("trainType", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.trainType)}
                                        >
                                            {TRAIN_TYPES.map((type) => (
                                                <option value={type} key={type}>{type}</option>
                                            ))}
                                        </select>
                                        {errorFor(fieldErrors, "trainType")}
                                    </label>

                                    <label className="aat-field">
                                        <span>Status</span>
                                        <select
                                            value={form.status}
                                            onChange={(event) => setValue("status", event.target.value)}
                                        >
                                            <option value="ACTIVE">Active</option>
                                            <option value="INACTIVE">Inactive</option>
                                        </select>
                                    </label>

                                    <label className="aat-field">
                                        <span>Rating</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="5"
                                            step="0.1"
                                            value={form.rating}
                                            onChange={(event) => setValue("rating", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.rating)}
                                        />
                                        {errorFor(fieldErrors, "rating")}
                                    </label>
                                </div>
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Route</span>
                                        <h3>Stations And Timing</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faClock} style={{ fontSize: 20 }} />
                                </div>

                                <div className="aat-grid four">
                                    <StationFieldPair
                                        codeLabel="Source Code"
                                        nameLabel="Source Station"
                                        codeValue={form.sourceCode}
                                        nameValue={form.sourceName}
                                        onCodeChange={(text) => setValue("sourceCode", normalizeCode(text))}
                                        onNameChange={(text) => setValue("sourceName", text)}
                                        onSelectStation={(station) => {
                                            setForm((current) => ({
                                                ...current,
                                                sourceCode: station.code,
                                                sourceName: station.name
                                            }));
                                        }}
                                        codeError={errorMessageFor(fieldErrors, "sourceCode")}
                                        nameError={errorMessageFor(fieldErrors, "sourceName")}
                                    />

                                    <label className="aat-field">
                                        <span>Departure</span>
                                        <input
                                            type="time"
                                            value={form.departureTime}
                                            onChange={(event) => setValue("departureTime", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.departureTime)}
                                        />
                                        {errorFor(fieldErrors, "departureTime")}
                                    </label>

                                    <StationFieldPair
                                        codeLabel="Destination Code"
                                        nameLabel="Destination Station"
                                        codeValue={form.destinationCode}
                                        nameValue={form.destinationName}
                                        onCodeChange={(text) => setValue("destinationCode", normalizeCode(text))}
                                        onNameChange={(text) => setValue("destinationName", text)}
                                        onSelectStation={(station) => {
                                            setForm((current) => ({
                                                ...current,
                                                destinationCode: station.code,
                                                destinationName: station.name
                                            }));
                                        }}
                                        codeError={errorMessageFor(fieldErrors, "destinationCode")}
                                        nameError={errorMessageFor(fieldErrors, "destinationName")}
                                    />

                                    <label className="aat-field">
                                        <span>Arrival</span>
                                        <input
                                            type="time"
                                            value={form.arrivalTime}
                                            onChange={(event) => setValue("arrivalTime", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.arrivalTime)}
                                        />
                                        {errorFor(fieldErrors, "arrivalTime")}
                                    </label>

                                    <label className="aat-field">
                                        <span>Duration</span>
                                        <input
                                            type="text"
                                            value={form.duration}
                                            onChange={(event) => setValue("duration", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.duration)}
                                        />
                                        {errorFor(fieldErrors, "duration")}
                                    </label>

                                    <label className="aat-field">
                                        <span>Distance Km</span>
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={form.distance}
                                            onChange={(event) => setValue("distance", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.distance)}
                                        />
                                        {errorFor(fieldErrors, "distance")}
                                    </label>

                                    <label className="aat-field">
                                        <span>Destination Day</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="7"
                                            step="1"
                                            value={form.destinationDay}
                                            onChange={(event) => setValue("destinationDay", event.target.value)}
                                            aria-invalid={Boolean(fieldErrors.destinationDay)}
                                        />
                                        {errorFor(fieldErrors, "destinationDay")}
                                    </label>

                                    <div className="aat-speed">
                                        <span>Avg Speed</span>
                                        <strong>{averageSpeed ? `${averageSpeed} km/h` : "0 km/h"}</strong>
                                    </div>
                                </div>
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Calendar</span>
                                        <h3>Running Days</h3>
                                    </div>
                                </div>

                                <div className="aat-day-grid">
                                    {DAYS.map((day) => (
                                        <label className={`aat-day ${form.runningDays.includes(day) ? "is-selected" : ""}`} key={day}>
                                            <input
                                                type="checkbox"
                                                checked={form.runningDays.includes(day)}
                                                onChange={() => toggleRunningDay(day)}
                                            />
                                            <span>{day}</span>
                                        </label>
                                    ))}
                                </div>
                                {errorFor(fieldErrors, "runningDays")}
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Inventory</span>
                                        <h3>Travel Classes</h3>
                                    </div>
                                    <button className="aat-add-btn" type="button" onClick={addClass}>
                                        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 14 }} />
                                        <span>Add Class</span>
                                    </button>
                                </div>

                                <div className="aat-repeat-list">
                                    {form.classes.map((item, index) => (
                                        <div className="aat-repeat-row class-row" key={`${index}-${item.code}`}>
                                            <label className="aat-field">
                                                <span>Class</span>
                                                <select
                                                    value={item.code}
                                                    onChange={(event) => updateClass(index, "code", event.target.value)}
                                                    aria-invalid={Boolean(fieldErrors[`class-${index}-code`])}
                                                >
                                                    <option value="">Select</option>
                                                    {CLASS_OPTIONS.map((option) => (
                                                        <option value={option.code} key={option.code}>
                                                            {option.code} - {option.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {errorFor(fieldErrors, `class-${index}-code`)}
                                            </label>

                                            <label className="aat-field">
                                                <span>Fare Per Km</span>
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={item.farePerKm}
                                                    onChange={(event) => updateClass(index, "farePerKm", event.target.value)}
                                                    aria-invalid={Boolean(fieldErrors[`class-${index}-farePerKm`])}
                                                />
                                                {errorFor(fieldErrors, `class-${index}-farePerKm`)}
                                            </label>

                                            <label className="aat-field">
                                                <span>Total Seats</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    value={item.totalSeats}
                                                    onChange={(event) => updateClass(index, "totalSeats", event.target.value)}
                                                    aria-invalid={Boolean(fieldErrors[`class-${index}-totalSeats`])}
                                                />
                                                {errorFor(fieldErrors, `class-${index}-totalSeats`)}
                                            </label>

                                            <button
                                                className="aat-row-remove"
                                                type="button"
                                                aria-label="Remove class"
                                                onClick={() => removeClass(index)}
                                                disabled={form.classes.length === 1}
                                            >
                                                <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 18 }} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {errorFor(fieldErrors, "classes")}
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Stops</span>
                                        <h3>Intermediate Stops</h3>
                                    </div>
                                </div>

                                {form.stops.length === 0 ? (
                                    <div className="ad-empty">No intermediate stops</div>
                                ) : (
                                    <div className="aat-repeat-list">
                                        {form.stops.map((stop, index) => (
                                            <div className="aat-repeat-row stop-row" key={index}>
                                                <StationFieldPair
                                                    codeLabel="Code"
                                                    nameLabel="Station"
                                                    codeValue={stop.stationCode}
                                                    nameValue={stop.stationName}
                                                    onCodeChange={(text) => updateStop(index, "stationCode", normalizeCode(text))}
                                                    onNameChange={(text) => updateStop(index, "stationName", text)}
                                                    onSelectStation={(station) => selectStopStation(index, station)}
                                                    codeError={errorMessageFor(fieldErrors, `stop-${index}-stationCode`)}
                                                    nameError={errorMessageFor(fieldErrors, `stop-${index}-stationName`)}
                                                    wideName={false}
                                                />

                                                <label className="aat-field">
                                                    <span>Arrival</span>
                                                    <input
                                                        type="time"
                                                        value={stop.arrivalTime}
                                                        onChange={(event) => updateStop(index, "arrivalTime", event.target.value)}
                                                        aria-invalid={Boolean(fieldErrors[`stop-${index}-arrivalTime`])}
                                                    />
                                                    {errorFor(fieldErrors, `stop-${index}-arrivalTime`)}
                                                </label>

                                                <label className="aat-field">
                                                    <span>Departure</span>
                                                    <input
                                                        type="time"
                                                        value={stop.departureTime}
                                                        onChange={(event) => updateStop(index, "departureTime", event.target.value)}
                                                        aria-invalid={Boolean(fieldErrors[`stop-${index}-departureTime`])}
                                                    />
                                                    {errorFor(fieldErrors, `stop-${index}-departureTime`)}
                                                </label>

                                                <label className="aat-field">
                                                    <span>Km</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        step="1"
                                                        value={stop.distance}
                                                        onChange={(event) => updateStop(index, "distance", event.target.value)}
                                                        aria-invalid={Boolean(fieldErrors[`stop-${index}-distance`])}
                                                    />
                                                    {errorFor(fieldErrors, `stop-${index}-distance`)}
                                                </label>

                                                <label className="aat-field">
                                                    <span>Day</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="7"
                                                        step="1"
                                                        value={stop.day}
                                                        onChange={(event) => updateStop(index, "day", event.target.value)}
                                                        aria-invalid={Boolean(fieldErrors[`stop-${index}-day`])}
                                                    />
                                                    {errorFor(fieldErrors, `stop-${index}-day`)}
                                                </label>

                                                <button
                                                    className="aat-row-remove"
                                                    type="button"
                                                    aria-label="Remove stop"
                                                    onClick={() => removeStop(index)}
                                                >
                                                    <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 18 }} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="aat-add-stop-wrapper">
                                    <button
                                        className="aat-add-btn"
                                        type="button"
                                        onClick={addStop}
                                    >
                                        <FontAwesomeIcon icon={faSquarePlus} />
                                        <span>Add Stop</span>
                                    </button>
                                </div>
                            </section>

                            <section className="ad-panel aat-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Amenities</span>
                                        <h3>Facilities</h3>
                                    </div>
                                </div>

                                <div className="aat-facility-grid">
                                    {FACILITIES.map((facility) => (
                                        <label
                                            className={`aat-switch ${form.facilities[facility.key] ? "is-on" : ""}`}
                                            key={facility.key}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={form.facilities[facility.key]}
                                                onChange={(event) => setFacility(facility.key, event.target.checked)}
                                            />
                                            <span>{facility.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <div className="aat-submit-bar">
                                <button className="aat-secondary" type="button" onClick={() => setForm(initialTrainForm)} disabled={saving}>
                                    <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                                    <span>Clear</span>
                                </button>
                                <button className="aat-primary" type="submit" disabled={saving}>
                                    <FontAwesomeIcon icon={faFloppyDisk} style={{ fontSize: 18 }} />
                                    <span>{saving ? "Saving" : "Save Train"}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
}

export default AdminAddTrain;
