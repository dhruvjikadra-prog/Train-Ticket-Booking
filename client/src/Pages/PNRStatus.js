import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import "../Styles/PNRStatus.css";
import useDocumentTitle from "../hooks/useDocumentTitle";

const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "AC Chair Car",
    EC: "Executive Chair Car",
    "2S": "Second Sitting"
};

const STATUS_META = {
    CNF: { label: "Confirmed", tone: "ok", icon: "fa-circle-check" },
    CONFIRMED: { label: "Confirmed", tone: "ok", icon: "fa-circle-check" },
    COMPLETED: { label: "Confirmed", tone: "ok", icon: "fa-circle-check" },
    PAYMENT_SUCCESS: { label: "Payment Successful", tone: "ok", icon: "fa-circle-check" },
    PARTIAL: { label: "Partially Confirmed", tone: "warn", icon: "fa-circle-half-stroke" },
    PARTIAL_CANCELLED: { label: "Partially Cancelled", tone: "warn", icon: "fa-circle-half-stroke" },
    RAC: { label: "RAC", tone: "warn", icon: "fa-clock" },
    WL: { label: "Waitlisted", tone: "warn", icon: "fa-clock" },
    WAITLIST: { label: "Waitlisted", tone: "warn", icon: "fa-clock" },
    PENDING: { label: "Pending", tone: "idle", icon: "fa-hourglass-half" },
    REVIEW_COMPLETED: { label: "Review Completed", tone: "idle", icon: "fa-clipboard-check" },
    SEAT_SELECTED: { label: "Seats Selected", tone: "idle", icon: "fa-chair" },
    EXPIRED: { label: "Expired", tone: "stop", icon: "fa-circle-exclamation" },
    CANCELLED: { label: "Cancelled", tone: "stop", icon: "fa-ban" },
    CAN: { label: "Cancelled", tone: "stop", icon: "fa-ban" }
};

const getStatusMeta = (value) =>
    STATUS_META[String(value || "").toUpperCase()] || {
        label: value || "Pending",
        tone: "idle",
        icon: "fa-circle-info"
    };

const formatDate = (value) => {
    if (!value) return "-";
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return "-";

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const getSeatLabel = (passenger) => {
    if (passenger.status === "CANCELLED" || passenger.reservationStatus === "CAN") {
        return passenger.cancelledSeatNumber
            ? `Cancelled (${passenger.cancelledSeatNumber})`
            : "Cancelled";
    }

    return passenger.seatNumber || passenger.reservationStatus || "-";
};

function PNRStatus() {
    const [pnrNumber, setPnrNumber] = useState("");
    const [captcha, setCaptcha] = useState(null);
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [result, setResult] = useState(null);

    useDocumentTitle('RailGo | PNR Status');

    const loadCaptcha = async () => {
        setCaptchaLoading(true);

        try {
            const response = await axios.get(`${API_BASE_URL}/pnr-status/captcha`);
            setCaptcha(response.data);
            setCaptchaAnswer("");
        } catch {
            setCaptcha(null);
            setFormError("Security check is unavailable right now.");
        } finally {
            setCaptchaLoading(false);
        }
    };

    useEffect(() => {
        loadCaptcha();
    }, []);

    const statusMeta = useMemo(
        () => getStatusMeta(result?.status || result?.reservationStatus),
        [result]
    );

    const activePassengerCount = useMemo(() => {
        if (!Array.isArray(result?.passengers)) return 0;
        return result.passengers.filter(
            (passenger) =>
                passenger.status !== "CANCELLED" &&
                passenger.reservationStatus !== "CAN"
        ).length;
    }, [result]);

    const validate = () => {
        const errors = {};

        if (!/^\d{10}$/.test(pnrNumber)) {
            errors.pnrNumber = "Enter a valid 10-digit PNR.";
        }

        if (!captcha?.token) {
            errors.captchaAnswer = "Refresh the security check.";
        } else if (!captchaAnswer.trim()) {
            errors.captchaAnswer = "Answer the security check.";
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSearch = async (event) => {
        event.preventDefault();
        if (searching) return;

        setFormError("");
        setResult(null);

        if (!validate()) return;

        setSearching(true);

        try {
            const response = await axios.post(`${API_BASE_URL}/pnr-status/search`, {
                pnrNumber,
                captchaToken: captcha.token,
                captchaAnswer
            });

            setResult(response.data.booking);
        } catch (error) {
            setFormError(
                error.response?.data?.message ||
                "Unable to fetch PNR status right now."
            );
        } finally {
            setSearching(false);
            loadCaptcha();
        }
    };

    return (
        <>
            <Navbar />
            <main className="pnr-page">
                <section className="pnr-hero">
                    <div className="pnr-hero__inner">
                        <span className="pnr-eyebrow">RailGo Status Desk</span>
                        <h1>PNR Status</h1>

                        <form className="pnr-search" onSubmit={handleSearch} noValidate>
                            <label className="pnr-field" htmlFor="pnr-number">
                                <span>10-digit PNR</span>
                                <div className={`pnr-input ${fieldErrors.pnrNumber ? "has-error" : ""}`}>
                                    <i className="fa-solid fa-ticket"></i>
                                    <input
                                        id="pnr-number"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        placeholder="1234567890"
                                        value={pnrNumber}
                                        maxLength={10}
                                        aria-invalid={Boolean(fieldErrors.pnrNumber)}
                                        onChange={(event) => {
                                            setPnrNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                                            setFieldErrors((errors) => ({ ...errors, pnrNumber: "" }));
                                        }}
                                    />
                                </div>
                                {fieldErrors.pnrNumber && (
                                    <small className="pnr-field-error">{fieldErrors.pnrNumber}</small>
                                )}
                            </label>

                            <label className="pnr-field" htmlFor="pnr-captcha">
                                <span>Security check</span>
                                <div className={`pnr-captcha ${fieldErrors.captchaAnswer ? "has-error" : ""}`}>
                                    <strong>{captchaLoading ? "..." : captcha?.question || "--"}</strong>
                                    <input
                                        id="pnr-captcha"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        placeholder="Answer"
                                        value={captchaAnswer}
                                        maxLength={3}
                                        disabled={captchaLoading || !captcha}
                                        aria-invalid={Boolean(fieldErrors.captchaAnswer)}
                                        onChange={(event) => {
                                            setCaptchaAnswer(event.target.value.replace(/\D/g, ""));
                                            setFieldErrors((errors) => ({ ...errors, captchaAnswer: "" }));
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className="pnr-refresh"
                                        aria-label="Refresh security check"
                                        title="Refresh security check"
                                        disabled={captchaLoading}
                                        onClick={loadCaptcha}
                                    >
                                        <i className={`fa-solid fa-arrows-rotate ${captchaLoading ? "pnr-spin" : ""}`}></i>
                                    </button>
                                </div>
                                {fieldErrors.captchaAnswer && (
                                    <small className="pnr-field-error">{fieldErrors.captchaAnswer}</small>
                                )}
                            </label>

                            <button className="pnr-submit" type="submit" disabled={searching || captchaLoading}>
                                <i className={`fa-solid ${searching ? "fa-circle-notch pnr-spin" : "fa-magnifying-glass"}`}></i>
                                <span>{searching ? "Checking" : "Check Status"}</span>
                            </button>
                        </form>
                    </div>
                </section>

                <section className="pnr-workspace" aria-live="polite">
                    {formError && (
                        <div className="pnr-alert" role="alert">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <span>{formError}</span>
                        </div>
                    )}

                    {searching && (
                        <div className="pnr-loading">
                            <i className="fa-solid fa-circle-notch pnr-spin"></i>
                            <strong>Checking PNR status</strong>
                        </div>
                    )}

                    {!searching && !result && !formError && (
                        <div className="pnr-empty">
                            <i className="fa-solid fa-receipt"></i>
                            <h2>Ready for lookup</h2>
                            <p>PNR status appears here after verification.</p>
                        </div>
                    )}

                    {result && (
                        <article className={`pnr-ticket pnr-ticket--${statusMeta.tone}`}>
                            <header className="pnr-ticket__header">
                                <div>
                                    <span className={`pnr-status pnr-status--${statusMeta.tone}`}>
                                        <i className={`fa-solid ${statusMeta.icon}`}></i>
                                        {statusMeta.label}
                                    </span>
                                    <h2>{result.train?.number || "-"} {result.train?.name || ""}</h2>
                                </div>
                                <div className="pnr-number-card">
                                    <small>PNR</small>
                                    <strong>{result.pnrNumber}</strong>
                                </div>
                            </header>

                            <div className="pnr-route">
                                <div>
                                    <small>From</small>
                                    <strong>{result.journey?.fromStation || "-"}</strong>
                                    <span>{result.journey?.departureTime || "-"}</span>
                                </div>
                                <div className="pnr-route-line" aria-hidden="true">
                                    <i className="fa-solid fa-train"></i>
                                </div>
                                <div>
                                    <small>To</small>
                                    <strong>{result.journey?.toStation || "-"}</strong>
                                    <span>{result.journey?.arrivalTime || "-"}</span>
                                </div>
                            </div>

                            <div className="pnr-meta">
                                <div>
                                    <small>Journey Date</small>
                                    <strong>{formatDate(result.journey?.journeyDate)}</strong>
                                </div>
                                <div>
                                    <small>Class</small>
                                    <strong>
                                        {CLASS_NAMES[result.journey?.classCode] || result.journey?.classCode || "-"}
                                    </strong>
                                </div>
                                <div>
                                    <small>Reservation</small>
                                    <strong>{result.reservationStatus || "-"}</strong>
                                </div>
                                <div>
                                    <small>Payment</small>
                                    <strong>{result.paymentStatus || "-"}</strong>
                                </div>
                                <div>
                                    <small>Active Passengers</small>
                                    <strong>{activePassengerCount}</strong>
                                </div>
                                <div>
                                    <small>Booked At</small>
                                    <strong>{formatDateTime(result.timeline?.bookedAt)}</strong>
                                </div>
                            </div>

                            <section className="pnr-passengers">
                                <div className="pnr-section-head">
                                    <h3>Passenger Status</h3>
                                    <span>{result.passengers?.length || 0} listed</span>
                                </div>

                                <div className="pnr-table">
                                    <div className="pnr-row pnr-row--head">
                                        <span>Passenger</span>
                                        <span>Status</span>
                                        <span>Berth / Seat</span>
                                    </div>
                                    {(result.passengers || []).map((passenger) => {
                                        const passengerMeta = getStatusMeta(
                                            passenger.status === "CANCELLED"
                                                ? "CAN"
                                                : passenger.reservationStatus
                                        );

                                        return (
                                            <div className="pnr-row" key={passenger.number}>
                                                <span>Passenger {passenger.number}</span>
                                                <span className={`pnr-mini-status pnr-mini-status--${passengerMeta.tone}`}>
                                                    {passengerMeta.label}
                                                </span>
                                                <strong>{getSeatLabel(passenger)}</strong>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <footer className="pnr-ticket__footer">
                                <span>
                                    <i className="fa-solid fa-calendar-check"></i>
                                    Ticket generated: {formatDateTime(result.timeline?.ticketGeneratedAt)}
                                </span>
                                <span>
                                    <i className="fa-solid fa-shield-halved"></i>
                                    Captcha verified
                                </span>
                            </footer>
                        </article>
                    )}
                </section>
            </main>
            <Footer />
        </>
    );
}

export default PNRStatus;
