import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import JourneyLoader from "../Components/JourneyLoader";
import { withMinimumDuration } from "../utils/loading";
import "../Styles/TrainResults.css";
import useDocumentTitle from "../hooks/useDocumentTitle";

const INDIA_TIME_ZONE = "Asia/Kolkata";

const getCurrentIndiaDateTime = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: INDIA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
        return result;
    }, {});

    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
};

const isValidDateValue = (date) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
    if (!match) return false;

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    return (
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day
    );
};

const validateSearch = ({ from, to, date }) => {
    if (!from || !to || !date) {
        return "From station, destination station, and journey date are required.";
    }

    if (from.toUpperCase() === to.toUpperCase()) {
        return "Departure and destination stations must be different.";
    }

    if (!isValidDateValue(date)) {
        return "Journey date is invalid. Please modify your search.";
    }

    if (date < getCurrentIndiaDateTime().date) {
        return "Journey date cannot be in the past.";
    }

    return "";
};

/* ── Class code → key mapping ────────────────────────────── */
// Maps class.name → fare key used in our helpers
const classByName = {
    "Sleeper": "sleeper",
    "AC Chair Car": "acChairCar",
    "Executive Chair Car": "executiveChairCar",
    "AC 3 Tier": "ac3",
    "AC 2 Tier": "ac2",
    "First AC": "firstAc",
};

const classByCode = {
    "SL": "sleeper",
    "CC": "acChairCar",
    "EC": "executiveChairCar",
    "3A": "ac3",
    "2A": "ac2",
    "1A": "firstAc",
};

const seatMeta = {
    sleeper: { label: "Sleeper", short: "SL", icon: "fa-bed" },
    acChairCar: { label: "AC Chair Car", short: "CC", icon: "fa-chair" },
    executiveChairCar: { label: "Executive Chair", short: "EC", icon: "fa-couch" },
    ac3: { label: "AC 3 Tier", short: "3A", icon: "fa-layer-group" },
    ac2: { label: "AC 2 Tier", short: "2A", icon: "fa-layer-group" },
    firstAc: { label: "First AC", short: "1A", icon: "fa-star" },
};

/* ── Day helpers ─────────────────────────────────────────── */
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VARIANTS = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
    friday: "Fri", saturday: "Sat", sunday: "Sun",
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
    fri: "Fri", sat: "Sat", sun: "Sun",
};
const normalizeDay = (d) => DAY_VARIANTS[d?.toLowerCase()] || null;

const getRunningDaysInfo = (rawDays = []) => {
    const normalized = rawDays.map(normalizeDay).filter(Boolean);
    const isDailyFull = ALL_DAYS.every((d) => normalized.includes(d));
    return { normalized, isDaily: isDailyFull || normalized.length === 0 };
};

const timeToMinutes = (time) => {
    const match = String(time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
};

const getDepartureMinutes = (train) => (
    timeToMinutes(
        train.departureTime ||
        train.boardingStation?.departureTime ||
        train.source?.departureTime
    )
);

const compareTrainsByDepartureTime = (a, b) => {
    const firstTime = getDepartureMinutes(a) ?? Number.POSITIVE_INFINITY;
    const secondTime = getDepartureMinutes(b) ?? Number.POSITIVE_INFINITY;

    if (firstTime !== secondTime) {
        return firstTime - secondTime;
    }

    return String(a.trainNumber || "").localeCompare(
        String(b.trainNumber || ""),
        undefined,
        { numeric: true }
    );
};

const getArrivalMinutes = (train) => (
    timeToMinutes(
        train.arrivalTime ||
        train.droppingStation?.arrivalTime ||
        train.destination?.arrivalTime
    )
);

const computeDurationMinutes = (train) => {
    const dep = train.boardingStation?.departureTime || train.departureTime;
    const arr = train.droppingStation?.arrivalTime || train.arrivalTime;
    const depMinutes = timeToMinutes(dep);
    const arrMinutes = timeToMinutes(arr);
    if (depMinutes === null || arrMinutes === null) return null;
    let mins = arrMinutes - depMinutes;
    if (mins < 0) mins += 24 * 60; // overnight
    return mins;
};

/* ── Minimum fare (used for price sorting) ───────────────── */
const computeMinFare = (train, trainClass) => {
    const fareMap = buildFareMap(train);
    if (trainClass && trainClass !== "All Class") {
        const key = classByName[trainClass];
        if (key && fareMap[key]) return fareMap[key];
    }
    const values = Object.values(fareMap).filter(Boolean);
    return values.length ? Math.min(...values) : null;
};

/* ── Train type classification ───────────────────────────── */
const getTrainTypeCategory = (train) => {
    const name = (train.name || "").toLowerCase();
    const num = parseInt(train.trainNumber, 10);

    if (/rajdhani|shatabdi|duronto|vande\s*bharat|tejas/.test(name)) return "premium";
    if (!Number.isNaN(num) && num >= 12000 && num <= 13999) return "superfast";
    if (!Number.isNaN(num) && num >= 50000 && num <= 59999) return "passenger";
    return "express";
};

// const trainTypeLabels = {
//     premium: "Premium",
//     superfast: "Superfast",
//     express: "Express",
//     passenger: "Passenger",
// };

/* ── Sorting helper (Departure / Arrival / Duration / Price) ─ */
const getSortValue = (train, key, trainClass) => {
    switch (key) {
        case "departure":
            return getDepartureMinutes(train) ?? Number.POSITIVE_INFINITY;
        case "arrival":
            return getArrivalMinutes(train) ?? Number.POSITIVE_INFINITY;
        case "duration":
            return computeDurationMinutes(train) ?? Number.POSITIVE_INFINITY;
        case "price": {
            const fare = computeMinFare(train, trainClass);
            return fare === null ? Number.POSITIVE_INFINITY : fare;
        }
        default:
            return 0;
    }
};

const sortTrains = (list, sortBy, trainClass) => {
    if (!sortBy || !sortBy.key) {
        return [...list].sort(compareTrainsByDepartureTime);
    }
    const dirMul = sortBy.dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
        const av = getSortValue(a, sortBy.key, trainClass);
        const bv = getSortValue(b, sortBy.key, trainClass);
        if (av !== bv) return (av - bv) * dirMul;
        return compareTrainsByDepartureTime(a, b);
    });
};

/* ── Upcoming date strip (7-10 days) ─────────────────────── */
const buildUpcomingDates = (todayStr, count = 30) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr || "");
    if (!match) return [];
    const [, y, m, d] = match.map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    const dates = [];

    for (let i = 0; i < count; i++) {
        const dt = new Date(base);
        dt.setUTCDate(base.getUTCDate() + i);
        const value = dt.toISOString().slice(0, 10);
        dates.push({
            value,
            dow: dt.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
            day: dt.getUTCDate(),
            mon: dt.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
            isToday: i === 0,
        });
    }
    return dates;
};

/* ── Date formatter ─────────────────────────────────────── */
const formatDate = (dateValue) => {
    if (!dateValue) return "Today";
    const [year, month, day] = dateValue.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
    });
};

const formatRefreshTime = (timestamp) => {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

/* ── Fare helpers ────────────────────────────────────────── 
   The DB stores fare as farePerKm on each class object.
   We build a normalised fare map: { sleeper: 131, ac3: 445, ... }
*/
const buildFareMap = (train) => {
    const map = {};
    const dist = train.boardingStation && train.droppingStation
        ? Math.abs((train.droppingStation.distance || 0) - (train.boardingStation.distance || 0))
        : train.distance || 0;

    (train.classes || []).forEach((cls) => {
        const key = classByName[cls.name] || classByCode[cls.code];
        if (key && cls.farePerKm) {
            map[key] = Math.round(cls.farePerKm * dist);
        }
    });
    return map;
};

/* ── Journey-date seat availability ─────────────────────── */
const getSeatAvailability = (train, trainClass) => {
    const fareMap = buildFareMap(train);
    const selectedKey = trainClass && trainClass !== "All Class"
        ? classByName[trainClass] : null;

    const inventory = train.seatInventory?.availability || {};
    const waitlistInventory = train.seatInventory?.waitlist || {};
    const offeredClassCodes = new Set(
        (train.classes || []).map((cls) => cls.code)
    );

    return Object.entries(seatMeta)
        .map(([key, meta]) => {
            const hasInventoryCount = Object.prototype.hasOwnProperty.call(
                inventory,
                meta.short
            );
            const rawCount = hasInventoryCount
                ? Number(inventory[meta.short])
                : null;
            const count = Number.isFinite(rawCount) ? rawCount : null;
            const price = fareMap[key] || 0;

            const rawWaitlistCount = Number(waitlistInventory[meta.short]);
            const waitlistCount = Number.isFinite(rawWaitlistCount)
                ? rawWaitlistCount
                : 0;

            if (!offeredClassCodes.has(meta.short) && !hasInventoryCount) {
                return null;
            }

            return {
                key,
                label: meta.label,
                short: meta.short,
                icon: meta.icon,
                count,
                waitlistCount,
                price,
                active: selectedKey === key,
                soldOut: count === 0,
                available: count === null ? null : count > 0,
            };
        })
        .filter(Boolean);
};

/* ── Duration from route ─────────────────────────────────── */
const computeDuration = (train) => {
    if (train.duration) return train.duration;
    const dep = train.boardingStation?.departureTime || train.departureTime;
    const arr = train.droppingStation?.arrivalTime || train.arrivalTime;
    const depMinutes = timeToMinutes(dep);
    const arrMinutes = timeToMinutes(arr);
    if (depMinutes === null || arrMinutes === null) return "—";
    let mins = arrMinutes - depMinutes;
    if (mins < 0) mins += 24 * 60; // overnight
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
};

/* ── Journey distance ────────────────────────────────────── */
const computeDistance = (train) => {
    if (train.boardingStation && train.droppingStation) {
        return Math.abs(
            (train.droppingStation.distance || 0) -
            (train.boardingStation.distance || 0)
        );
    }
    return train.distance || 0;
};

/* ── Halts between boarding and dropping ────────────────── */
const computeHalts = (train) => {
    const route = train.route;
    if (!Array.isArray(route) || route.length < 2) return null;
    const fromName = train.boardingStation?.stationCode || "";
    const toName = train.droppingStation?.stationCode || "";
    const si = route.findIndex((s) => s.stationCode === fromName);
    const di = route.findIndex((s) => s.stationCode === toName);
    if (si === -1 || di === -1) return route.length - 2;
    return Math.max(0, di - si - 1);
};

/* ── Running days display ────────────────────────────────── */
function RunningDays({ rawDays }) {
    const { normalized, isDaily } = getRunningDaysInfo(rawDays);
    if (isDaily) {
        return (
            <span className="daily-chip">
                <i className="fa-solid fa-rotate"></i>
                Runs Daily
            </span>
        );
    }
    return (
        <div className="day-chips">
            {ALL_DAYS.map((day) => (
                <span
                    key={day}
                    className={`day-chip ${normalized.includes(day) ? "runs" : ""}`}
                    title={normalized.includes(day) ? `Runs on ${day}` : `Does not run on ${day}`}
                >
                    {day.charAt(0)}
                </span>
            ))}
        </div>
    );
}

/* ── Route Timetable Modal ───────────────────────────────── */
function RouteModal({ train, onClose }) {
    const route = train.route || [];

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const boardingCode = train.boardingStation?.stationCode;
    const droppingCode = train.droppingStation?.stationCode;

    const getRowType = (code) => {
        if (code === boardingCode) return "boarding";
        if (code === droppingCode) return "dropping";
        return "intermediate";
    };

    return (
        <div className="route-modal-overlay" onClick={onClose}>
            <div className="route-modal" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="route-modal-header">
                    <div className="route-modal-title">
                        <i className="fa-solid fa-train"></i>
                        <div>
                            <span className="route-modal-train-num">#{train.trainNumber}</span>
                            <h2>{train.name}</h2>
                        </div>
                    </div>
                    <button className="route-modal-close" onClick={onClose} aria-label="Close">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Sub-header */}
                <div className="route-modal-sub">
                    <span>
                        <i className="fa-solid fa-map-pin"></i>
                        {route.length} stations
                    </span>
                    <span>
                        <i className="fa-solid fa-road"></i>
                        {train.distance} km total
                    </span>
                    <span>
                        <i className="fa-solid fa-clock"></i>
                        {train.duration}
                    </span>
                </div>

                {/* Timetable */}
                <div className="route-modal-body">
                    <table className="route-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Station</th>
                                <th>Arrival</th>
                                <th>Departure</th>
                                <th>Halt</th>
                                <th>Day</th>
                                <th>Dist (km)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {route.map((stop, idx) => {
                                const rowType = getRowType(stop.stationCode);
                                const haltMins = (() => {
                                    if (!stop.arrivalTime || !stop.departureTime) return null;
                                    const [ah, am] = stop.arrivalTime.split(":").map(Number);
                                    const [dh, dm] = stop.departureTime.split(":").map(Number);
                                    const diff = (dh * 60 + dm) - (ah * 60 + am);
                                    return diff > 0 ? diff : null;
                                })();

                                return (
                                    <tr key={stop.stationCode} className={`route-row route-row--${rowType}`}>
                                        <td className="stop-num">{stop.stopNumber ?? idx + 1}</td>
                                        <td className="stop-station">
                                            <div className="stop-dot-wrap">
                                                <span className={`stop-dot stop-dot--${rowType}`}></span>
                                                {idx < route.length - 1 && (
                                                    <span className="stop-connector"></span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="stop-code">{stop.stationCode}</div>
                                                <div className="stop-name">{stop.stationName}</div>
                                                {rowType === "boarding" && (
                                                    <span className="stop-badge boarding-badge">Boarding</span>
                                                )}
                                                {rowType === "dropping" && (
                                                    <span className="stop-badge dropping-badge">Dropping</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="stop-time">
                                            {stop.arrivalTime || <span className="stop-origin">Origin</span>}
                                        </td>
                                        <td className="stop-time">
                                            {stop.departureTime || <span className="stop-origin">Dest.</span>}
                                        </td>
                                        <td className="stop-halt">
                                            {haltMins != null ? `${haltMins} min` : "—"}
                                        </td>
                                        <td className="stop-day">Day {stop.day ?? 1}</td>
                                        <td className="stop-dist">{stop.distance ?? "—"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Legend */}
                <div className="route-modal-legend">
                    <span className="legend-item">
                        <span className="stop-dot stop-dot--boarding legend-dot"></span>
                        Your boarding station
                    </span>
                    <span className="legend-item">
                        <span className="stop-dot stop-dot--dropping legend-dot"></span>
                        Your dropping station
                    </span>
                    <span className="legend-item">
                        <span className="stop-dot stop-dot--intermediate legend-dot"></span>
                        Intermediate halt
                    </span>
                </div>
            </div>
        </div>
    );
}

/* ── Skeleton loader ─────────────────────────────────────── */
/* ── Train card ──────────────────────────────────────────── */
function TrainCard({
    train,
    trainClass,
    journeyDate,
    availabilityRefresh,
    onRefreshClassAvailability
}) {
    const [showRoute, setShowRoute] = useState(false);

    const seatAvailability = useMemo(
        () => getSeatAvailability(train, trainClass),
        [train, trainClass]
    );
    const hasSeatInventory = Boolean(train.seatInventory);
    const totalSeats = seatAvailability.reduce((t, s) => t + (s.count || 0), 0);
    const duration = computeDuration(train);
    const distance = computeDistance(train);
    const halts = computeHalts(train);
    const [selectedClass, setSelectedClass] = useState(null);

    // Only the chosen class's own availability decides CONFIRMED vs WL —
    // a class with 0 seats left should route the user to the waiting list
    // even if other classes on the same train still have seats.

    // const bookingType = selectedClass?.count > 0 ? "CONFIRMED" : "WL";
    let bookingType = "NOT_OPEN";

    if (train.bookingOpen && selectedClass) {

        if (selectedClass.count > 0) {
            bookingType = "CONFIRMED";
        }
        else {
            bookingType = "WL";
        }

    }

    // Boarding / dropping resolved by the backend (boardingStation / droppingStation)
    const boardingStation = train.boardingStation || train.source || {};
    const droppingStation = train.droppingStation || train.destination || {};
    const departureTime = train.departureTime || boardingStation.departureTime || "—";
    const arrivalTime = train.arrivalTime || droppingStation.arrivalTime || "—";
    const avgSpeed = train.averageSpeed || train.avgSpeed;

    const handleRefreshClass = (event, seat) => {
        event.stopPropagation();

        if (!onRefreshClassAvailability) return;

        onRefreshClassAvailability({
            trainId: train._id,
            trainNumber: train.trainNumber,
            classCode: seat.short,
            className: seat.label,
            from: boardingStation.stationCode,
            to: droppingStation.stationCode,
        });
    };

    const num = parseInt(train.trainNumber, 10);
    const isSuperfast = num >= 12000 && num <= 12999;

    // useEffect(() => {
    //     if (trainClass && trainClass !== "All Class") {
    //         const found = seatAvailability.find(
    //             seat => seat.label === trainClass
    //         );

    //         setSelectedClass(found?.available ? found : null);
    //     } else {
    //         setSelectedClass(null);
    //     }
    // }, [seatAvailability, trainClass]);

    useEffect(() => {
        if (trainClass && trainClass !== "All Class") {
            const found = seatAvailability.find(
                (seat) => seat.label === trainClass
            );

            setSelectedClass(found || null);
        } else {
            setSelectedClass(null);
        }
    }, [seatAvailability, trainClass]);

    return (
        <>
            <article className="train-card">

                {/* ── Header ── */}
                <div className="train-card-header">
                    <div>
                        <div className="train-number">
                            <i className="fa-solid fa-hashtag"></i>
                            {train.trainNumber}
                        </div>
                        <h3>{train.name}</h3>
                    </div>
                    <div className="train-badges">
                        {train.rating && (
                            <span className="rating-badge">
                                <i className="fa-solid fa-star"></i>
                                {train.rating}
                            </span>
                        )}
                        {isSuperfast && (
                            <span className="superfast-badge">
                                <i className="fa-solid fa-bolt"></i>
                                Superfast
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Route timeline ── */}
                <div className="route-timeline">
                    <div className="time-block">
                        <strong>{departureTime}</strong>
                        <span className="station-code">{boardingStation.stationCode || "N/A"}</span>
                        <span>{boardingStation.stationName}</span>
                    </div>

                    <div className="timeline-track">
                        <div className="tr-track-line-wrap">
                            <span className="tr-track-line"></span>
                            <div className="track-icon">
                                <i className="fa-solid fa-train"></i>
                            </div>
                            <span className="tr-track-line"></span>
                        </div>
                        <div className="track-meta">
                            <span>
                                <i className="fa-regular fa-clock"></i>
                                {duration}
                            </span>
                            <span>
                                <i className="fa-solid fa-road"></i>
                                {distance} km
                            </span>
                        </div>
                    </div>

                    <div className="time-block end">
                        <strong>{arrivalTime}</strong>
                        <span className="station-code">{droppingStation.stationCode || "N/A"}</span>
                        <span>{droppingStation.stationName}</span>
                    </div>
                </div>

                {/* ── Info grid ── */}
                <div className="train-info-section">
                    <div className="train-info-grid">
                        <div className="info-cell">
                            <div className="info-cell-label">
                                <i className="fa-solid fa-route"></i>
                                Distance
                            </div>
                            <div className="info-cell-value">{distance} km</div>
                        </div>

                        <div className="info-cell">
                            <div className="info-cell-label">
                                <i className="fa-solid fa-gauge-high"></i>
                                Avg Speed
                            </div>
                            <div className="info-cell-value">
                                {avgSpeed ? `${avgSpeed} km/h` : "—"}
                            </div>
                        </div>

                        <div className="info-cell">
                            <div className="info-cell-label">
                                <i className="fa-solid fa-ticket"></i>
                                Available Seats
                            </div>
                            <div className="info-cell-value">{!train.bookingOpen ? "Not Released" : totalSeats || "—"}</div>
                        </div>

                        <div className="info-cell">
                            <div className="info-cell-label">
                                <i className="fa-solid fa-map-pin"></i>
                                Halts
                            </div>
                            <div className="info-cell-value">
                                {halts != null ? halts : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Running days ── */}
                <div className="running-days-section">
                    <div className="running-days-wrap">
                        <div className="running-days-label">
                            <i className="fa-solid fa-calendar-week"></i>
                            Runs on
                        </div>
                        <RunningDays rawDays={train.runningDays} />
                    </div>
                </div>

                {/* ── Classes offered ── */}
                {train.classes?.length > 0 && (
                    <div className="classes-strip">
                        {train.classes.map((cls) => (
                            <span className="class-tag" key={cls.code}>
                                <i className="fa-solid fa-chair"></i>
                                {cls.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* ── Class-wise seat availability ── */}
                <div className="seat-availability">
                    <div className="seat-title">
                        <i className="fa-solid fa-layer-group"></i>
                        Class-wise Seat Availability
                    </div>

                    {!train.bookingOpen ? (
                        <div
                            className="result-message"
                            style={{ padding: "12px 14px", fontSize: "13px" }}
                        >
                            <i className="fa-solid fa-circle-info"></i>
                            Seat reservation has not opened for this journey. Booking will be available once reservations are released.
                        </div>
                    ) : hasSeatInventory && seatAvailability.length > 0 ? (
                        <div className="seat-chip-list">
                            {seatAvailability.map((seat) => {
                                const refreshKey = `${train._id}:${seat.short}`;
                                const refreshState = availabilityRefresh?.[refreshKey] || {};
                                const refreshedTime = formatRefreshTime(refreshState.updatedAt);

                                return (
                                <div
                                    key={seat.key}
                                    onClick={() => setSelectedClass(seat)}
                                    className={`seat-chip ${selectedClass?.key === seat.key ? "selected" : ""
                                        } ${seat.count === 0 && seat.waitlistCount === 0
                                            ? "sold-out"
                                            : ""
                                        } ${refreshState.loading ? "refreshing" : ""} ${refreshState.error ? "refresh-error" : ""}`}
                                >
                                    <div className="seat-chip-top">
                                        <span className="seat-chip-name">
                                            {seat.label}
                                        </span>

                                        <span
                                            className={`seat-count-badge ${seat.soldOut ? "waitlist-badge" : ""
                                                }`}
                                            title={
                                                seat.count > 0
                                                    ? `${seat.count} seats available on ${formatDate(journeyDate)}`
                                                    : seat.waitlistCount >= 0
                                                        ? `No seats available. ${seat.waitlistCount} passenger(s) currently on the waiting list.`
                                                        : "No seats available."
                                            }
                                        >
                                            {seat.count > 0
                                                ? seat.count
                                                : seat.waitlistCount >= 0
                                                    ? `WL ${seat.waitlistCount}`
                                                    : "NA"}
                                        </span>
                                    </div>

                                    <div className="seat-chip-bottom">
                                        {seat.price > 0 && (
                                        <span className="seat-fare">
                                            ₹ {seat.price.toLocaleString("en-IN")}
                                        </span>
                                    )}

                                        <button
                                            type="button"
                                            className="seat-refresh-btn"
                                            disabled={
                                                refreshState.loading ||
                                                !boardingStation.stationCode ||
                                                !droppingStation.stationCode
                                            }
                                            onClick={(event) => handleRefreshClass(event, seat)}
                                            aria-label={`Refresh ${seat.label} availability`}
                                            title={`Refresh ${seat.label} availability`}
                                        >
                                            <i className={`fa-solid ${refreshState.loading ? "fa-spinner" : "fa-rotate-right"}`}></i>
                                            <span>{refreshState.loading ? "Refreshing" : "Refresh"}</span>
                                        </button>
                                    </div>

                                    {refreshedTime && !refreshState.error && (
                                        <span className="seat-refresh-time">
                                            <i className="fa-regular fa-clock"></i>
                                            Updated {refreshedTime}
                                        </span>
                                    )}

                                    {refreshState.error && (
                                        <span className="seat-refresh-error">
                                            <i className="fa-solid fa-circle-exclamation"></i>
                                            {refreshState.error}
                                        </span>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div
                            className="result-message"
                            style={{ padding: "12px 14px", fontSize: "13px" }}
                        >
                            <i className="fa-solid fa-circle-info"></i>
                            Seat availability has not been released yet. Please check again later.
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="train-card-footer">
                    {/* <div className="fare-box">
                        <span>{trainClass && trainClass !== "All Class" ? `${trainClass} fare` : "Starts from"}</span>
                        <strong>
                            {fare
                                ? `₹ ${fare.toLocaleString("en-IN")}`
                                : <span style={{ fontSize: "1rem", color: "#6a7e92" }}>Check fare</span>}
                        </strong>
                    </div> */}

                    <div className="footer-actions">
                        <button
                            className="route-btn"
                            type="button"
                            onClick={() => setShowRoute(true)}
                        >
                            <i className="fa-solid fa-map-location-dot"></i>
                            Train Route
                        </button>
                        {/* <button className="details-btn" type="button">
                            <i className="fa-solid fa-circle-info"></i>
                            Details
                        </button> */}
                        <button
                            className={`book-btn ${!selectedClass ? "disabled-btn" : ""}`}
                            type="button"
                            disabled={!selectedClass || !train.bookingOpen}
                            onClick={() => {
                                if (!train.bookingOpen) return;
                                if (!selectedClass) return;

                                const query = new URLSearchParams({
                                    trainId: train._id,
                                    trainNo: train.trainNumber,
                                    from: boardingStation.stationCode,
                                    to: droppingStation.stationCode,
                                    date: journeyDate,
                                    class: selectedClass.short,
                                    bookingType
                                });

                                window.location.href = `/passenger-details?${query.toString()}`;
                            }}
                        // style={(!isAvailable && seatAvailability.length > 0)
                        //     ? { opacity: .55, cursor: "not-allowed" } : {}}
                        >
                            <i className="fa-solid fa-bolt"></i>
                            {!selectedClass
                                ? "Select Class"
                                : bookingType === "NOT_OPEN"
                                    ? "Booking Not Open"
                                    : bookingType === "CONFIRMED"
                                        ? "Book Now"
                                        : bookingType === "RAC"
                                            ? "Book RAC"
                                            : "Join Waiting List"}
                        </button>
                    </div>
                </div>
            </article>

            {/* Route Modal */}
            {showRoute && (
                <RouteModal
                    train={{ ...train, duration, distance }}
                    onClose={() => setShowRoute(false)}
                />
            )}
        </>
    );
}

/* ── Filter panel ────────────────────────────────────────── */
const TIME_SLOTS = [
    { key: "morning", label: "Morning", sub: "06–12", icon: "fa-sun" },
    { key: "afternoon", label: "Afternoon", sub: "12–18", icon: "fa-cloud-sun" },
    { key: "evening", label: "Evening", sub: "18–21", icon: "fa-moon" },
    { key: "night", label: "Night", sub: "21–06", icon: "fa-star" },
];

const TRAIN_TYPES = [
    { key: "premium", label: "Premium", sub: "Rajdhani/Shatabdi", icon: "fa-crown" },
    { key: "superfast", label: "Superfast", sub: "12000–13999", icon: "fa-bolt" },
    { key: "express", label: "Express", sub: "Regular", icon: "fa-train" },
    { key: "passenger", label: "Passenger", sub: "All stops", icon: "fa-train-subway" },
];

const FILTER_COUNTABLE_KEYS = [
    "availableOnly", "acOnly", "timeSlot", "arrivalSlot", "trainType",
    "sleeper", "ac3", "ac2", "firstAc", "chairCar",
];

const countActiveFilters = (filters) => {
    let count = 0;
    FILTER_COUNTABLE_KEYS.forEach((key) => {
        const value = filters[key];
        if (typeof value === "boolean" && value) count += 1;
        else if (typeof value === "string" && value) count += 1;
    });
    count += (filters.runningDays || []).length;
    return count;
};

function FilterPanel({ filters, setFilters }) {
    const toggle = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));
    const setTime = (slot) =>
        setFilters((f) => ({ ...f, timeSlot: f.timeSlot === slot ? null : slot }));
    const setArrival = (slot) =>
        setFilters((f) => ({ ...f, arrivalSlot: f.arrivalSlot === slot ? null : slot }));
    const setTrainType = (type) =>
        setFilters((f) => ({ ...f, trainType: f.trainType === type ? null : type }));
    const toggleRunningDay = (day) =>
        setFilters((f) => ({
            ...f,
            runningDays: f.runningDays.includes(day)
                ? f.runningDays.filter((d) => d !== day)
                : [...f.runningDays, day],
        }));

    const activeCount = countActiveFilters(filters);

    const clearAll = () => setFilters({
        availableOnly: false,
        acOnly: false,
        timeSlot: null,
        arrivalSlot: null,
        trainType: null,
        runningDays: [],
        sleeper: false,
        ac3: false,
        ac2: false,
        firstAc: false,
        chairCar: false,
    });

    return (
        <aside className="filter-panel">
            <div className="filter-panel-head">
                <h3>
                    <i className="fa-solid fa-sliders" style={{ color: "#0d6efd", marginRight: 8 }}></i>
                    Smart Filters
                    {activeCount > 0 && <span className="filter-count-badge">{activeCount}</span>}
                </h3>
                {activeCount > 0 && (
                    <button type="button" className="filter-clear-btn" onClick={clearAll}>
                        Clear all
                    </button>
                )}
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Availability</div>
                <label>
                    <input type="checkbox" checked={filters.availableOnly} onChange={() => toggle("availableOnly")} />
                    Available seats only
                </label>
                <label>
                    <input type="checkbox" checked={filters.acOnly} onChange={() => toggle("acOnly")} />
                    AC coaches only
                </label>
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Departure Time</div>
                <div className="filter-time-grid">
                    {TIME_SLOTS.map((slot) => (
                        <div
                            key={slot.key}
                            className={`filter-time-chip ${filters.timeSlot === slot.key ? "selected" : ""}`}
                            onClick={() => setTime(slot.key)}
                        >
                            <i className={`fa-solid ${slot.icon}`}></i>
                            <span>{slot.label}</span>
                            <span style={{ opacity: .65 }}>{slot.sub}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Arrival Time</div>
                <div className="filter-time-grid">
                    {TIME_SLOTS.map((slot) => (
                        <div
                            key={slot.key}
                            className={`filter-time-chip ${filters.arrivalSlot === slot.key ? "selected" : ""}`}
                            onClick={() => setArrival(slot.key)}
                        >
                            <i className={`fa-solid ${slot.icon}`}></i>
                            <span>{slot.label}</span>
                            <span style={{ opacity: .65 }}>{slot.sub}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Train Type</div>
                <div className="filter-time-grid">
                    {TRAIN_TYPES.map((type) => (
                        <div
                            key={type.key}
                            className={`filter-time-chip ${filters.trainType === type.key ? "selected" : ""}`}
                            onClick={() => setTrainType(type.key)}
                        >
                            <i className={`fa-solid ${type.icon}`}></i>
                            <span>{type.label}</span>
                            <span style={{ opacity: .65 }}>{type.sub}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Classes</div>
                <label>
                    <input type="checkbox" checked={filters.sleeper} onChange={() => toggle("sleeper")} />
                    Sleeper (SL)
                </label>
                <label>
                    <input type="checkbox" checked={filters.ac3} onChange={() => toggle("ac3")} />
                    AC 3 Tier (3A)
                </label>
                <label>
                    <input type="checkbox" checked={filters.ac2} onChange={() => toggle("ac2")} />
                    AC 2 Tier (2A)
                </label>
                <label>
                    <input type="checkbox" checked={filters.firstAc} onChange={() => toggle("firstAc")} />
                    First AC (1A)
                </label>
                <label>
                    <input type="checkbox" checked={filters.chairCar} onChange={() => toggle("chairCar")} />
                    Chair Car (CC / EC)
                </label>
            </div>

            <div className="filter-section">
                <div className="filter-section-title">Running Days</div>
                <div className="filter-day-grid">
                    {ALL_DAYS.map((day) => (
                        <div
                            key={day}
                            className={`filter-day-chip ${filters.runningDays.includes(day) ? "selected" : ""}`}
                            onClick={() => toggleRunningDay(day)}
                            title={`Show trains running on ${day}`}
                        >
                            {day.charAt(0)}
                        </div>
                    ))}
                </div>
                <p className="filter-day-hint">Pick day(s) to see trains that also run then. Leave blank for all.</p>
            </div>

            <div className="filter-note">
                <i className="fa-solid fa-clock"></i>
                Seat counts update in real time as bookings open.
            </div>
        </aside>
    );
}

/* ── Main page ───────────────────────────────────────────── */
function TrainResults() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [trains, setTrains] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentIndiaTime, setCurrentIndiaTime] = useState(() => getCurrentIndiaDateTime());
    const [filters, setFilters] = useState({
        availableOnly: false,
        acOnly: false,
        timeSlot: null,
        arrivalSlot: null,
        trainType: null,
        runningDays: [],
        sleeper: false,
        ac3: false,
        ac2: false,
        firstAc: false,
        chairCar: false,
    });
    const [sortBy, setSortBy] = useState({ key: null, dir: "asc" });
    const [availabilityRefresh, setAvailabilityRefresh] = useState({});

    useDocumentTitle("RailGo - Train Search Results");

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setCurrentIndiaTime(getCurrentIndiaDateTime());
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, []);

    const searchKey = searchParams.toString();

    const search = useMemo(() => {
        const params = new URLSearchParams(searchKey);
        return {
            from: params.get("from") || "",
            to: params.get("to") || "",
            date: params.get("date") || "",
            trainClass: params.get("class") || "All Class",
        };
    }, [searchKey]);

    /* Upcoming 10-day date strip, anchored to "today" in India time */
    const dateStripDays = useMemo(
        () => buildUpcomingDates(currentIndiaTime.date, 30),
        [currentIndiaTime.date]
    );

    const handleDateSelect = (value) => {
        if (!value || value === search.date) return;
        const params = new URLSearchParams(searchParams);
        params.set("date", value);
        setSearchParams(params);
    };

    const handleSortClick = (key) => {
        setSortBy((prev) => {
            if (prev.key !== key) return { key, dir: "asc" };
            if (prev.dir === "asc") return { key, dir: "desc" };
            return { key: null, dir: "asc" };
        });
    };

    const SORT_OPTIONS = [
        { key: "departure", label: "Departure", icon: "fa-train" },
        { key: "arrival", label: "Arrival", icon: "fa-location-dot" },
        { key: "duration", label: "Duration", icon: "fa-clock" },
        { key: "price", label: "Price", icon: "fa-indian-rupee-sign" },
    ];

    const handleRefreshClassAvailability = async ({
        trainId,
        classCode,
        from,
        to,
    }) => {
        if (!trainId || !classCode) return;

        const refreshKey = `${trainId}:${classCode}`;

        setAvailabilityRefresh((prev) => ({
            ...prev,
            [refreshKey]: {
                ...prev[refreshKey],
                loading: true,
                error: "",
            },
        }));

        try {
            const res = await axios.get(`${API_BASE_URL}/trains/${trainId}/availability`, {
                params: {
                    date: search.date,
                    from,
                    to,
                    classCode,
                },
            });

            const data = res.data || {};
            const availableSeats = Number(
                data.availableSeats ??
                data.seatInventory?.availability?.[classCode]
            );
            const waitlistCount = Number(
                data.waitlistCount ??
                data.seatInventory?.waitlist?.[classCode] ??
                0
            );
            const safeAvailableSeats = Number.isFinite(availableSeats) ? availableSeats : 0;
            const safeWaitlistCount = Number.isFinite(waitlistCount) ? waitlistCount : 0;
            const updatedAt = data.updatedAt || new Date().toISOString();

            setTrains((currentTrains) => currentTrains.map((train) => {
                if (train._id !== trainId) return train;

                const currentInventory = train.seatInventory || {};
                const currentAvailability = currentInventory.availability || {};
                const currentWaitlist = currentInventory.waitlist || {};
                const bookingOpen = train.bookingOpen || Boolean(data.classBookingOpen);

                return {
                    ...train,
                    bookingOpen,
                    bookingStatus: bookingOpen ? "OPEN" : train.bookingStatus,
                    seatInventory: {
                        ...currentInventory,
                        journeyDate: data.journeyDate || search.date,
                        availability: {
                            ...currentAvailability,
                            [classCode]: safeAvailableSeats,
                        },
                        waitlist: {
                            ...currentWaitlist,
                            [classCode]: safeWaitlistCount,
                        },
                    },
                };
            }));

            setAvailabilityRefresh((prev) => ({
                ...prev,
                [refreshKey]: {
                    loading: false,
                    error: "",
                    updatedAt,
                },
            }));
        } catch (err) {
            setAvailabilityRefresh((prev) => ({
                ...prev,
                [refreshKey]: {
                    loading: false,
                    error: err.response?.data?.message || "Refresh failed",
                    updatedAt: prev[refreshKey]?.updatedAt,
                },
            }));
        }
    };

    useEffect(() => {
        if (!search.from || !search.to || !search.date || !search.trainClass) {
            navigate("/", { replace: true });
        }
    }, [search, navigate]);

    useEffect(() => {
        const fetchTrains = async () => {
            setLoading(true);
            setError("");

            const validationError = validateSearch(search);

            if (validationError) {
                setError(validationError);
                setTrains([]);
                setAvailabilityRefresh({});
                setLoading(false);
                return;
            }

            try {
                const res = await withMinimumDuration(
                    axios.get(`${API_BASE_URL}/trains/search`, {
                        params: {
                            from: search.from,
                            to: search.to,
                            date: search.date,
                            class: search.trainClass,
                        },
                    })
                );
                setTrains(res.data?.trains || []);
                setAvailabilityRefresh({});
            } catch (err) {
                setError(err.response?.data?.message || "Unable to fetch train results.");
                setTrains([]);
                setAvailabilityRefresh({});
            } finally {
                setLoading(false);
            }
        };
        fetchTrains();
    }, [search]);

    /* client-side filter */
    const visibleTrains = useMemo(() => {
        const todayDepartureCutoff =
            search.date === currentIndiaTime.date
                ? currentIndiaTime.minutes
                : null;

        const filtered = trains.filter((train) => {
            const depMinutes = getDepartureMinutes(train);
            const depH = depMinutes === null ? null : Math.floor(depMinutes / 60);

            if (todayDepartureCutoff !== null && depMinutes !== null) {
                if (depMinutes <= todayDepartureCutoff) return false;
            }

            if (filters.availableOnly) {
                const avail = getSeatAvailability(train, search.trainClass);
                if (!avail.some((s) => s.count > 0)) return false;
            }
            if (filters.acOnly) {
                const hasAc = (train.classes || []).some((c) =>
                    c.name?.includes("AC") || c.name?.includes("First")
                );
                if (!hasAc) return false;
            }
            if (filters.sleeper) {
                if (!(train.classes || []).some((c) => c.code === "SL")) return false;
            }
            if (filters.ac3) {
                if (!(train.classes || []).some((c) => c.code === "3A")) return false;
            }
            if (filters.ac2) {
                if (!(train.classes || []).some((c) => c.code === "2A")) return false;
            }
            if (filters.firstAc) {
                if (!(train.classes || []).some((c) => c.code === "1A")) return false;
            }
            if (filters.chairCar) {
                if (!(train.classes || []).some((c) => c.code === "CC" || c.code === "EC")) return false;
            }
            if (filters.timeSlot && depH != null) {
                const inSlot = {
                    morning: depH >= 6 && depH < 12,
                    afternoon: depH >= 12 && depH < 18,
                    evening: depH >= 18 && depH < 21,
                    night: depH >= 21 || depH < 6,
                }[filters.timeSlot];
                if (!inSlot) return false;
            }
            if (filters.arrivalSlot) {
                const arrMinutes = getArrivalMinutes(train);
                const arrH = arrMinutes === null ? null : Math.floor(arrMinutes / 60);
                if (arrH == null) return false;
                const inSlot = {
                    morning: arrH >= 6 && arrH < 12,
                    afternoon: arrH >= 12 && arrH < 18,
                    evening: arrH >= 18 && arrH < 21,
                    night: arrH >= 21 || arrH < 6,
                }[filters.arrivalSlot];
                if (!inSlot) return false;
            }
            if (filters.trainType) {
                if (getTrainTypeCategory(train) !== filters.trainType) return false;
            }
            if (filters.runningDays.length > 0) {
                const { normalized, isDaily } = getRunningDaysInfo(train.runningDays);
                if (!isDaily) {
                    const matchesAnySelected = filters.runningDays.some((d) => normalized.includes(d));
                    if (!matchesAnySelected) return false;
                }
            }
            return true;
        });

        return sortTrains(filtered, sortBy, search.trainClass);
    }, [trains, filters, sortBy, search.date, search.trainClass, currentIndiaTime]);

    if (!search.from || !search.to || !search.date || !search.trainClass) {
        return null;
    }

    return (
        <>
            <Navbar />
            <main className="results-page">

                {/* ── Hero ── */}
                <section className="results-hero">
                    <div className="container">
                        <div className="results-heading">
                            <Link to="/" className="back-link">
                                <i className="fa-solid fa-arrow-left"></i>
                                Modify Search
                            </Link>
                            <div>
                                <h1>Available Trains</h1>
                                <p>Compare timings, fares, seats, and coach options for your journey.</p>
                            </div>
                        </div>

                        <div className="journey-summary">
                            <div className="summary-item">
                                <i className="fa-solid fa-train-subway"></i>
                                <span>From</span>
                                <strong>{search.from || "Any station"}</strong>
                            </div>
                            <div className="summary-line">
                                <i className="fa-solid fa-arrow-right"></i>
                            </div>
                            <div className="summary-item">
                                <i className="fa-solid fa-location-dot"></i>
                                <span>To</span>
                                <strong>{search.to || "Any station"}</strong>
                            </div>
                            <div className="summary-item">
                                <i className="fa-solid fa-calendar-days"></i>
                                <span>Date</span>
                                <strong>{formatDate(search.date)}</strong>
                            </div>
                            <div className="summary-item">
                                <i className="fa-solid fa-chair"></i>
                                <span>Class</span>
                                <strong>{search.trainClass}</strong>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Upcoming dates strip ── */}
                <section className="date-strip-bar">
                    <div className="container">
                        <div className="date-strip-inner">
                            <div className="date-strip-label">
                                <i className="fa-solid fa-calendar-days"></i>
                                <span>Pick a date</span>
                            </div>
                            <div className="date-strip-scroll">
                                {dateStripDays.map((d) => (
                                    <button
                                        key={d.value}
                                        type="button"
                                        className={`date-chip ${d.value === search.date ? "active" : ""}`}
                                        onClick={() => handleDateSelect(d.value)}
                                    >
                                        <span className="date-chip-dow">{d.isToday ? "Today" : d.dow}</span>
                                        <span className="date-chip-num">{d.day}</span>
                                        <span className="date-chip-mon">{d.mon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Results section ── */}
                <section className="results-section">
                    <div className="container">
                        <div className="results-toolbar">
                            <div>
                                <span className="toolbar-label">Search Results</span>
                                <h2>
                                    {loading
                                        ? "Finding best trains…"
                                        : `${visibleTrains.length} train${visibleTrains.length !== 1 ? "s" : ""} found`}
                                </h2>
                                <p className="toolbar-subtext">
                                    Showing trains for <strong>{formatDate(search.date)}</strong>
                                </p>
                            </div>
                            <div className="toolbar-chip">
                                <i className="fa-solid fa-shield-halved"></i>
                                Secure booking
                            </div>
                        </div>

                        <div className="sort-bar">
                            <span className="sort-bar-label">
                                <i className="fa-solid fa-arrow-down-wide-short"></i>
                                Sort by
                            </span>
                            {SORT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`sort-chip ${sortBy.key === opt.key ? "active" : ""}`}
                                    onClick={() => handleSortClick(opt.key)}
                                >
                                    <i className={`fa-solid ${opt.icon}`}></i>
                                    {opt.label}
                                    {sortBy.key === opt.key && (
                                        <i className={`fa-solid fa-arrow-${sortBy.dir === "asc" ? "up" : "down"} sort-dir-icon`}></i>
                                    )}
                                </button>
                            ))}
                        </div>

                        {error && (
                            <div className="result-message error">
                                <i className="fa-solid fa-circle-exclamation"></i>
                                {error}
                            </div>
                        )}

                        <div className="results-layout">
                            <FilterPanel filters={filters} setFilters={setFilters} />

                            <div className="train-list">
                                {loading && (
                                    <JourneyLoader
                                        mode="inline"
                                        title="Scanning the railway network"
                                        subtitle="Comparing train times, fares, and live seat inventory for your route."
                                    />
                                )}

                                {!loading && !error && visibleTrains.length === 0 && (
                                    <div className="result-message">
                                        <i className="fa-solid fa-magnifying-glass"></i>
                                        No trains found for this route. Try changing stations, date, or class.
                                    </div>
                                )}

                                {!loading && visibleTrains.map((train) => (
                                    <TrainCard
                                        key={train.trainNumber}
                                        train={train}
                                        trainClass={search.trainClass}
                                        journeyDate={search.date}
                                        availabilityRefresh={availabilityRefresh}
                                        onRefreshClassAvailability={handleRefreshClassAvailability}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </>
    );
}

export default TrainResults;
