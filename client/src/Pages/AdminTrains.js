import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBars,
    faCircleCheck,
    faClock,
    faFloppyDisk,
    faHouse,
    faListUl,
    faMagnifyingGlass,
    faMoon,
    faPenToSquare,
    faPlus,
    faRightFromBracket,
    faRoute,
    faShieldHalved,
    faSquarePlus,
    faStar,
    faSun,
    faTrain,
    faTrashCan,
    faTriangleExclamation,
    faUser,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminAddTrain.css";
import "../Styles/AdminTrains.css";
import RailGo from "../Assets/logo.png";
import StationFieldPair from "../Components/StationFieldPair";
import {
    DAYS,
    CLASS_OPTIONS,
    TRAIN_TYPES,
    FACILITIES,
    titleForClass,
    normalizeCode,
    errorFor as errorMessageFor,
    validateTrainForm,
    buildTrainPayload,
    buildFormFromTrain,
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

function StatusBadge({ status }) {
    const isActive = status === "ACTIVE";
    return (
        <span className={`at-badge ${isActive ? "is-active" : "is-inactive"}`}>
            {isActive ? "Active" : "Inactive"}
        </span>
    );
}

function timeToMinutes(time) {
    const match = String(time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

function compareTrainsByDepartureTime(a, b) {
    const firstTime = timeToMinutes(a?.departureTime) ?? Number.POSITIVE_INFINITY;
    const secondTime = timeToMinutes(b?.departureTime) ?? Number.POSITIVE_INFINITY;

    if (firstTime !== secondTime) {
        return firstTime - secondTime;
    }

    return String(a?.trainNumber || "").localeCompare(
        String(b?.trainNumber || ""),
        undefined,
        { numeric: true }
    );
}

/* ---------------------------------------------------------------------- */
/* Edit modal - reuses the same field layout/validation as Add Train      */
/* ---------------------------------------------------------------------- */

function EditTrainModal({ train, onClose, onSaved, getCsrfToken, onUnauthorized }) {
    const [form, setForm] = useState(() => buildFormFromTrain(train));
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const averageSpeed = useMemo(() => computeAverageSpeed(form), [form]);

    const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const setFacility = (key, value) => {
        setForm((current) => ({
            ...current,
            facilities: { ...current.facilities, [key]: value }
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
        setForm((current) => ({
            ...current,
            classes: current.classes.map((item, itemIndex) => {
                if (itemIndex !== index) return item;
                if (key === "code") return { ...item, code: value, name: titleForClass(value) };
                return { ...item, [key]: value };
            })
        }));
    };

    const addClass = () => {
        setForm((current) => ({
            ...current,
            classes: [...current.classes, { code: "", name: "", farePerKm: "", totalSeats: "" }]
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
                stopIndex === index ? { ...stop, stationCode: station.code, stationName: station.name } : stop
            ))
        }));
    };

    const addStop = () => {
        setForm((current) => ({
            ...current,
            stops: [...current.stops, { stationCode: "", stationName: "", arrivalTime: "", departureTime: "", distance: "", day: "1" }]
        }));
    };

    const removeStop = (index) => {
        setForm((current) => ({
            ...current,
            stops: current.stops.filter((_, stopIndex) => stopIndex !== index)
        }));
    };

    const saveTrain = async (payload) => {
        const csrfToken = await getCsrfToken();
        return trainApi.put(`/${train._id}`, payload, {
            headers: { "X-CSRF-Token": csrfToken }
        });
    };

    const showSaveError = (err) => {
        const serverErrors = err.response?.data?.errors;
        setFormError(
            Array.isArray(serverErrors) && serverErrors.length
                ? serverErrors[0]
                : err.response?.data?.message || "Train could not be updated."
        );
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (saving) return;

        setFormError("");
        const errors = validateTrainForm(form);
        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            setFormError("Please fix the highlighted fields.");
            return;
        }

        const payload = buildTrainPayload(form);
        setSaving(true);

        try {
            const response = await saveTrain(payload);
            onSaved(response.data.train || { ...train, ...payload });
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    const response = await saveTrain(payload);
                    onSaved(response.data.train || { ...train, ...payload });
                } catch (refreshErr) {
                    if (refreshErr.response?.status === 401) {
                        onUnauthorized();
                    } else {
                        showSaveError(refreshErr);
                    }
                }
            } else {
                showSaveError(err);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="at-modal-scrim" role="presentation" onMouseDown={onClose}>
            <div
                className="at-modal at-modal-wide"
                role="dialog"
                aria-modal="true"
                aria-label="Edit train"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="at-modal-head">
                    <div>
                        <span className="ad-kicker">Editing</span>
                        <h3>{train.trainNumber} · {train.name}</h3>
                    </div>
                    <button className="ad-icon-btn" type="button" aria-label="Close" onClick={onClose}>
                        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                    </button>
                </div>

                <div className="at-modal-body">
                    {formError && (
                        <div className="ad-alert" role="alert">
                            <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                            <span>{formError}</span>
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
                                    <select value={form.status} onChange={(event) => setValue("status", event.target.value)}>
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
                                    onSelectStation={(station) => setForm((current) => ({
                                        ...current, sourceCode: station.code, sourceName: station.name
                                    }))}
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
                                    onSelectStation={(station) => setForm((current) => ({
                                        ...current, destinationCode: station.code, destinationName: station.name
                                    }))}
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
                                <button className="aat-add-btn" type="button" onClick={addStop}>
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
                            <button className="aat-secondary" type="button" onClick={onClose} disabled={saving}>
                                <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                                <span>Cancel</span>
                            </button>
                            <button className="aat-primary" type="submit" disabled={saving}>
                                <FontAwesomeIcon icon={faFloppyDisk} style={{ fontSize: 18 }} />
                                <span>{saving ? "Saving" : "Save Changes"}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Details modal - read-only view of the full train document              */
/* ---------------------------------------------------------------------- */

function DetailsModal({ train, onClose }) {
    return (
        <div className="at-modal-scrim" role="presentation" onMouseDown={onClose}>
            <div
                className="at-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Train details"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="at-modal-head">
                    <div>
                        <span className="ad-kicker">{train.trainNumber}</span>
                        <h3>{train.name}</h3>
                    </div>
                    <button className="ad-icon-btn" type="button" aria-label="Close" onClick={onClose}>
                        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                    </button>
                </div>

                <div className="at-modal-body">
                    <div className="at-detail-grid">
                        <div className="at-detail-item">
                            <span>Type</span>
                            <strong>{train.trainType}</strong>
                        </div>
                        <div className="at-detail-item">
                            <span>Status</span>
                            <strong><StatusBadge status={train.status} /></strong>
                        </div>
                        <div className="at-detail-item">
                            <span>Rating</span>
                            <strong><FontAwesomeIcon icon={faStar} style={{ fontSize: 13, marginRight: 4 }} />{train.rating}</strong>
                        </div>
                        <div className="at-detail-item">
                            <span>Distance</span>
                            <strong>{train.distance} km</strong>
                        </div>
                        <div className="at-detail-item">
                            <span>Duration</span>
                            <strong>{train.duration}</strong>
                        </div>
                        <div className="at-detail-item">
                            <span>Avg Speed</span>
                            <strong>{train.averageSpeed} km/h</strong>
                        </div>
                    </div>

                    <div className="at-route-line">
                        <div>
                            <strong>{train.source?.stationName}</strong>
                            <span>{train.source?.stationCode} · {train.departureTime}</span>
                        </div>
                        <FontAwesomeIcon icon={faRoute} style={{ fontSize: 16 }} />
                        <div>
                            <strong>{train.destination?.stationName}</strong>
                            <span>{train.destination?.stationCode} · {train.arrivalTime}</span>
                        </div>
                    </div>

                    <h4 className="at-section-title">Running Days</h4>
                    <div className="at-chip-row">
                        {DAYS.map((day) => (
                            <span key={day} className={`at-chip ${train.runningDays?.includes(day) ? "is-on" : ""}`}>
                                {day}
                            </span>
                        ))}
                    </div>

                    <h4 className="at-section-title">Full Route</h4>
                    <div className="at-timeline">
                        {(train.route || []).map((stop, index) => (
                            <div className="at-timeline-row" key={`${stop.stationCode}-${index}`}>
                                <div className="at-timeline-dot" />
                                <div className="at-timeline-info">
                                    <strong>{stop.stationName} ({stop.stationCode})</strong>
                                    <span>
                                        Day {stop.day}
                                        {stop.arrivalTime ? ` · Arr ${stop.arrivalTime}` : ""}
                                        {stop.departureTime ? ` · Dep ${stop.departureTime}` : ""}
                                        {` · ${stop.distance} km`}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h4 className="at-section-title">Classes</h4>
                    <div className="at-class-grid">
                        {(train.classes || []).map((cls) => (
                            <div className="at-class-card" key={cls.code}>
                                <strong>{cls.code}</strong>
                                <span>{cls.name}</span>
                                <span>₹{cls.farePerKm}/km</span>
                                <span>{cls.totalSeats} seats</span>
                            </div>
                        ))}
                    </div>

                    <h4 className="at-section-title">Facilities</h4>
                    <div className="at-chip-row">
                        {FACILITIES.map((facility) => (
                            <span key={facility.key} className={`at-chip ${train.facilities?.[facility.key] ? "is-on" : ""}`}>
                                {facility.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Delete confirm modal                                                    */
/* ---------------------------------------------------------------------- */

function DeleteConfirmModal({ train, onCancel, onConfirm, deleting, error }) {
    return (
        <div className="at-modal-scrim" role="presentation" onMouseDown={onCancel}>
            <div
                className="at-modal at-modal-small"
                role="alertdialog"
                aria-modal="true"
                aria-label="Delete train"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="at-modal-head">
                    <div>
                        <span className="ad-kicker">Delete Train</span>
                        <h3>{train.trainNumber} · {train.name}</h3>
                    </div>
                </div>
                <div className="at-modal-body">
                    {error && (
                        <div className="ad-alert" role="alert">
                            <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                            <span>{error}</span>
                        </div>
                    )}
                    <p className="at-confirm-text">
                        This will permanently remove this train and its route from the system. This action cannot be undone.
                    </p>
                    <div className="aat-submit-bar">
                        <button className="aat-secondary" type="button" onClick={onCancel} disabled={deleting}>
                            <span>Cancel</span>
                        </button>
                        <button className="at-danger-btn" type="button" onClick={onConfirm} disabled={deleting}>
                            <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 16 }} />
                            <span>{deleting ? "Deleting" : "Delete Train"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------- */
/* Main page                                                               */
/* ---------------------------------------------------------------------- */

function AdminTrains() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    const [trains, setTrains] = useState([]);
    const [trainsLoading, setTrainsLoading] = useState(true);
    const [trainsError, setTrainsError] = useState("");
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    const [viewingTrain, setViewingTrain] = useState(null);
    const [editingTrain, setEditingTrain] = useState(null);
    const [deletingTrain, setDeletingTrain] = useState(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [banner, setBanner] = useState("");
    const isModalOpen = Boolean(viewingTrain || editingTrain || deletingTrain);

    useEffect(() => {
        document.title = "Train Booking - Admin Trains";
        return () => { document.title = "Train Booking"; };
    }, []);

    useEffect(() => {
        if (!isModalOpen) return undefined;

        document.body.classList.add("at-modal-open");
        document.documentElement.classList.add("at-modal-open");

        return () => {
            document.body.classList.remove("at-modal-open");
            document.documentElement.classList.remove("at-modal-open");
        };
    }, [isModalOpen]);

    useEffect(() => {
        localStorage.setItem("admin-dashboard-theme", theme);
    }, [theme]);

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
            }
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        verifyAdmin();
    }, [verifyAdmin]);

    const fetchTrains = useCallback(async () => {
        setTrainsLoading(true);
        setTrainsError("");

        try {
            const response = await trainApi.get("/");
            const list = Array.isArray(response.data) ? response.data : response.data.trains || [];
            setTrains(list);
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    const response = await trainApi.get("/");
                    const list = Array.isArray(response.data) ? response.data : response.data.trains || [];
                    setTrains(list);
                } catch {
                    navigate("/admin-login", { replace: true });
                }
            } else {
                setTrainsError(err.response?.data?.message || "Could not load trains.");
            }
        } finally {
            setTrainsLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchTrains();
    }, [fetchTrains]);

    const getCsrfToken = useCallback(async () => {
        const csrfRes = await authApi.get("/csrf-token");
        return csrfRes.data.csrfToken;
    }, []);

    const navItems = [
        { label: "Dashboard", to: "/admin/dashboard", icon: faHouse },
        { label: "All Trains", to: "/admin/trains", icon: faListUl, active: true },
        { label: "Add Train", to: "/admin/trains/add", icon: faTrain },
        { label: "Add Journey + Seats", to: "/admin/release-seats", icon: faSquarePlus }
    ];

    const filteredTrains = useMemo(() => {
        const query = searchText.trim().toLowerCase();

        return trains
            .filter((train) => (statusFilter === "ALL" ? true : train.status === statusFilter))
            .filter((train) => {
                if (!query) return true;
                const haystack = [
                    train.trainNumber,
                    train.name,
                    train.trainType,
                    train.source?.stationCode,
                    train.source?.stationName,
                    train.destination?.stationCode,
                    train.destination?.stationName
                ].join(" ").toLowerCase();
                return haystack.includes(query);
            })
            .sort(compareTrainsByDepartureTime);
    }, [trains, searchText, statusFilter]);

    const handleSaved = (updatedTrain) => {
        setTrains((current) => current.map((train) => (
            train._id === updatedTrain._id ? updatedTrain : train
        )));
        setEditingTrain(null);
        setBanner("Train updated successfully.");
        setTimeout(() => setBanner(""), 4000);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingTrain) return;
        const trainToDelete = deletingTrain;
        setDeleteBusy(true);
        setDeleteError("");

        const deleteTrain = async () => {
            const csrfToken = await getCsrfToken();
            return trainApi.delete(`/${trainToDelete._id}`, {
                headers: { "X-CSRF-Token": csrfToken }
            });
        };

        const finishDelete = () => {
            setTrains((current) => current.filter((train) => train._id !== trainToDelete._id));
            setDeletingTrain(null);
            setBanner("Train deleted successfully.");
            setTimeout(() => setBanner(""), 4000);
        };

        try {
            await deleteTrain();
            finishDelete();
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    await deleteTrain();
                    finishDelete();
                } catch (refreshErr) {
                    if (refreshErr.response?.status === 401) {
                        navigate("/admin-login", { replace: true });
                    } else {
                        setDeleteError(refreshErr.response?.data?.message || "Train could not be deleted.");
                    }
                }
            } else {
                setDeleteError(err.response?.data?.message || "Train could not be deleted.");
            }
        } finally {
            setDeleteBusy(false);
        }
    };

    const handleLogout = async () => {
        try {
            const csrfToken = await getCsrfToken();
            await authApi.post("/logout", {}, { headers: { "X-CSRF-Token": csrfToken } });
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
                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            to={item.to}
                            className={item.active ? "is-active" : ""}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <FontAwesomeIcon icon={item.icon} style={{ fontSize: 18 }} />
                            <span>{item.label}</span>
                        </Link>
                    ))}
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
                            <h1>All Trains</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <Link className="aat-back-link" to="/admin/trains/add">
                            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 18 }} />
                            <span>Add Train</span>
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
                    <div className="ad-content at-content">
                        {banner && (
                            <div className="aat-success" role="status">
                                <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 18 }} />
                                <span>{banner}</span>
                            </div>
                        )}

                        {trainsError && (
                            <div className="ad-alert" role="alert">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                                <span>{trainsError}</span>
                            </div>
                        )}

                        <section className="ad-panel at-toolbar">
                            <label className="at-search">
                                <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 15 }} />
                                <input
                                    type="text"
                                    placeholder="Search by number, name, or station"
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </label>

                            <select
                                className="at-status-filter"
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                            >
                                <option value="ALL">All Status</option>
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>

                            <span className="at-count">{filteredTrains.length} train{filteredTrains.length === 1 ? "" : "s"}</span>
                        </section>

                        <section className="ad-panel at-panel">
                            {trainsLoading ? (
                                <div className="ad-empty">Loading trains…</div>
                            ) : filteredTrains.length === 0 ? (
                                <div className="ad-empty">No trains match your search.</div>
                            ) : (
                                <div className="at-table-wrap">
                                    <table className="at-table">
                                        <thead>
                                            <tr>
                                                <th>Train</th>
                                                <th>Route</th>
                                                <th>Timing</th>
                                                <th>Days</th>
                                                <th>Rating</th>
                                                <th>Status</th>
                                                <th className="at-actions-col">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTrains.map((train) => (
                                                <tr key={train._id}>
                                                    <td>
                                                        <strong>{train.trainNumber}</strong>
                                                        <span className="at-subtext">{train.name}</span>
                                                        <span className="at-subtext at-muted">{train.trainType}</span>
                                                    </td>
                                                    <td>
                                                        <span>{train.source?.stationCode} → {train.destination?.stationCode}</span>
                                                        <span className="at-subtext at-muted">
                                                            {train.source?.stationName} to {train.destination?.stationName}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span>{train.departureTime} → {train.arrivalTime}</span>
                                                        <span className="at-subtext at-muted">{train.duration} · {train.distance} km</span>
                                                    </td>
                                                    <td>
                                                        <span className="at-subtext at-muted">
                                                            {(train.runningDays || []).length === 7
                                                                ? "Daily"
                                                                : (train.runningDays || []).join(", ")}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <FontAwesomeIcon icon={faStar} style={{ fontSize: 12, marginRight: 4 }} />
                                                        {train.rating}
                                                    </td>
                                                    <td>
                                                        <StatusBadge status={train.status} />
                                                    </td>
                                                    <td>
                                                        <div className="at-row-actions">
                                                            <button
                                                                className="at-icon-action"
                                                                type="button"
                                                                title="View details"
                                                                aria-label="View details"
                                                                onClick={() => setViewingTrain(train)}
                                                            >
                                                                <FontAwesomeIcon icon={faRoute} style={{ fontSize: 15 }} />
                                                            </button>
                                                            <button
                                                                className="at-icon-action"
                                                                type="button"
                                                                title="Edit train"
                                                                aria-label="Edit train"
                                                                onClick={() => setEditingTrain(train)}
                                                            >
                                                                <FontAwesomeIcon icon={faPenToSquare} style={{ fontSize: 15 }} />
                                                            </button>
                                                            <button
                                                                className="at-icon-action at-icon-danger"
                                                                type="button"
                                                                title="Delete train"
                                                                aria-label="Delete train"
                                                                onClick={() => { setDeletingTrain(train); setDeleteError(""); }}
                                                            >
                                                                <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 15 }} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>

            {viewingTrain && (
                <DetailsModal train={viewingTrain} onClose={() => setViewingTrain(null)} />
            )}

            {editingTrain && (
                <EditTrainModal
                    train={editingTrain}
                    onClose={() => setEditingTrain(null)}
                    onSaved={handleSaved}
                    getCsrfToken={getCsrfToken}
                    onUnauthorized={() => navigate("/admin-login", { replace: true })}
                />
            )}

            {deletingTrain && (
                <DeleteConfirmModal
                    train={deletingTrain}
                    onCancel={() => { setDeletingTrain(null); setDeleteError(""); }}
                    onConfirm={handleDeleteConfirm}
                    deleting={deleteBusy}
                    error={deleteError}
                />
            )}
        </div>
    );
}

export default AdminTrains;
