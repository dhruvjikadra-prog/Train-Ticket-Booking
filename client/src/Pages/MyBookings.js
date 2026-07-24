import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import "../Styles/MyBookings.css";
import useDocumentTitle from "../hooks/useDocumentTitle";


const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "AC Chair Car",
    EC: "Executive Chair Car"
};

const STATUS_META = {
    CONFIRMED: { label: "Confirmed", tone: "ok" },
    COMPLETED: { label: "Confirmed", tone: "ok" },
    PAYMENT_SUCCESS: { label: "Payment Successful", tone: "ok" },
    REVIEW_COMPLETED: { label: "Review Completed", tone: "low" },
    SEAT_SELECTED: { label: "Seats Selected", tone: "low" },
    PENDING: { label: "Pending", tone: "low" },
    EXPIRED: { label: "Expired", tone: "none" },
    RAC: { label: "RAC", tone: "low" },
    WAITLIST: { label: "Waitlisted", tone: "low" },
    WL: { label: "Waitlisted", tone: "low" },
    PARTIAL_CANCELLED: { label: "Partially Cancelled", tone: "low" },
    CANCELLED: { label: "Cancelled", tone: "none" }
};

const getStatusMeta = (status) =>
    STATUS_META[status?.toUpperCase?.()] || { label: status || "Pending", tone: "low" };

const FILTERS = [
    { key: "ALL", label: "All trips" },
    { key: "UPCOMING", label: "Upcoming" },
    { key: "COMPLETED", label: "Completed" },
    { key: "CANCELLED", label: "Cancelled" }
];

const PAGE_SIZE = 6;

const formatDate = (value) => {
    if (!value) return "—";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

const getBucket = (booking) => {
    if (booking.bookingStatus?.toUpperCase?.() === "CANCELLED") return "CANCELLED";
    if (booking.cancellationStatus === "FULLY_CANCELLED") return "CANCELLED";
    if (!booking.journey?.journeyDate) return "UPCOMING";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const journeyDate = new Date(booking.journey.journeyDate);

    return journeyDate >= today ? "UPCOMING" : "COMPLETED";
};

// Statuses that mean there is nothing left to cancel, or that the booking
// isn't in a state a passenger is allowed to touch from this screen.
const NON_CANCELLABLE_BOOKING_STATUSES = ["cancelled", "expired", "payment_processing"];

// Mirrors the guardrails enforced server-side in bookingCancellationService,
// so the button only ever appears when a cancel request stands a real chance
// of succeeding.
const getCancelEligibility = (booking) => {
    if (getBucket(booking) !== "UPCOMING") {
        return { canCancel: false, reason: "Only upcoming trips can be cancelled here." };
    }

    if (booking.cancellationStatus === "FULLY_CANCELLED") {
        return { canCancel: false, reason: "This booking is already fully cancelled." };
    }

    const status = booking.bookingStatus?.toLowerCase?.() || "";
    if (NON_CANCELLABLE_BOOKING_STATUSES.includes(status)) {
        return {
            canCancel: false,
            reason:
                status === "payment_processing"
                    ? "A payment is currently processing for this booking."
                    : "This booking can no longer be cancelled."
        };
    }

    if (!booking.token) {
        return { canCancel: false, reason: "Missing booking reference." };
    }

    return { canCancel: true, reason: "" };
};

function MyBookings() {
    const navigate = useNavigate();

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("ALL");
    const [query, setQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [cancelTarget, setCancelTarget] = useState(null); // booking staged for confirmation
    const [cancelReason, setCancelReason] = useState("");
    const [cancelError, setCancelError] = useState("");
    const [cancellingToken, setCancellingToken] = useState(null); // token currently in-flight
    const [toast, setToast] = useState(null); // { tone: "ok" | "error", message }
    const token = localStorage.getItem("token");
    const [selectedPassengers, setSelectedPassengers] = useState([]);

    useDocumentTitle('RailGo - My Bookings');

    const fetchBookings = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await axios.get(
                `${API_BASE_URL}/my-bookings/history`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            setBookings(response.data.bookings || []);
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                "Unable to load your booking history."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => setToast(null), 4500);
        return () => clearTimeout(timer);
    }, [toast]);

    // Prevent the page behind the modal from scrolling while it's open,
    // and always restore the original overflow value on close/unmount.
    useEffect(() => {
        if (!cancelTarget) return undefined;

        const { style } = document.body;
        const previousOverflow = style.overflow;
        style.overflow = "hidden";

        return () => {
            style.overflow = previousOverflow;
        };
    }, [cancelTarget]);

    const openCancelModal = (booking) => {
        const { canCancel, reason } = getCancelEligibility(booking);
        if (!canCancel) {
            setToast({ tone: "error", message: reason });
            return;
        }
        setCancelReason("");
        setCancelError("");
        setSelectedPassengers(
            booking.passengers
                .filter((p) => p.status !== "CANCELLED")
                .map((p) => p.id)
        );

        setCancelTarget(booking);
    };

    const closeCancelModal = () => {
        if (cancellingToken) return; // don't let a request get orphaned mid-flight
        setCancelTarget(null);
        setCancelReason("");
        setCancelError("");
    };

    const confirmCancelBooking = async () => {
        if (!cancelTarget) return;

        const { canCancel, reason } = getCancelEligibility(cancelTarget);
        if (!canCancel) {
            setCancelError(reason);
            return;
        }

        if (selectedPassengers.length === 0) {
            setCancelError("Select at least one passenger to cancel.");
            return;
        }

        setCancellingToken(cancelTarget.token);
        setCancelError("");

        try {
            await axios.patch(
                `${API_BASE_URL}/my-bookings/token/${cancelTarget.token}/cancel`,
                {
                    cancelAll:
                        selectedPassengers.length ===
                        cancelTarget.passengers.filter(
                            p => p.status !== "CANCELLED"
                        ).length,

                    passengerIds: selectedPassengers,
                    reason: cancelReason.trim() || "Cancelled by user"
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            setCancelTarget(null);
            setCancelReason("");
            setToast({
                tone: "ok",
                message: `Booking ${cancelTarget.pnrNumber ? `(PNR ${cancelTarget.pnrNumber})` : ""} cancelled successfully.`
            });

            // Re-pull the authoritative list rather than guessing at the
            // shape of a partial update, so status/fare/refund fields stay correct.
            await fetchBookings();
        } catch (requestError) {
            setCancelError(
                requestError.response?.data?.message ||
                "Unable to cancel this booking right now. Please try again."
            );
        } finally {
            setCancellingToken(null);
        }
    };

    const bucketCounts = useMemo(() => {
        const counts = { ALL: bookings.length, UPCOMING: 0, COMPLETED: 0, CANCELLED: 0 };
        bookings.forEach((booking) => {
            counts[getBucket(booking)] += 1;
        });
        return counts;
    }, [bookings]);

    const filteredBookings = useMemo(() => {
        const term = query.trim().toLowerCase();

        return bookings
            .filter((booking) => filter === "ALL" || getBucket(booking) === filter)
            .filter((booking) => {
                if (!term) return true;
                const haystack = [
                    booking.pnrNumber,
                    booking.train?.number,
                    booking.train?.name,
                    booking.journey?.fromStation,
                    booking.journey?.toStation
                ]
                    .join(" ")
                    .toLowerCase();
                return haystack.includes(term);
            })
            .sort(
                (a, b) =>
                    new Date(b.journey?.journeyDate || 0) -
                    new Date(a.journey?.journeyDate || 0)
            );
    }, [bookings, filter, query]);

    const visibleBookings = filteredBookings.slice(0, visibleCount);
    const hasMore = visibleCount < filteredBookings.length;

    const resetPaging = () => setVisibleCount(PAGE_SIZE);

    const openTicketAction = (token, action) => {
        if (!token) return;
        const param = action === "print" ? "autoPrint" : "autoDownload";
        window.open(`/booking-success?token=${token}&${param}=1`, "_blank", "noopener");
    };

    return (
        <>
            {!cancelTarget && <Navbar />}
            <main className="mb-page">
                <section className="mb-hero">
                    <span className="mb-hero__eyebrow">Travel history</span>
                    <h1>My bookings</h1>
                    <p>
                        Every journey you've reserved, in one place — pull up the
                        e-ticket, print it, or save a copy whenever you need it.
                    </p>

                    <div className="mb-search">
                        <i className="fa-solid fa-magnifying-glass"></i>
                        <input
                            type="text"
                            placeholder="Search by PNR, train number or station"
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                resetPaging();
                            }}
                        />
                    </div>
                </section>

                <section className="mb-workspace">
                    <div className="mb-tabs" role="tablist">
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="tab"
                                aria-selected={filter === item.key}
                                className={`mb-tab ${filter === item.key ? "active" : ""}`}
                                onClick={() => {
                                    setFilter(item.key);
                                    resetPaging();
                                }}
                            >
                                {item.label}
                                <span>{bucketCounts[item.key] || 0}</span>
                            </button>
                        ))}
                    </div>

                    {loading && (
                        <div className="mb-skeleton-list">
                            <div className="mb-skeleton"></div>
                            <div className="mb-skeleton"></div>
                            <div className="mb-skeleton"></div>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="mb-state mb-state--error">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <h2>Couldn't load your bookings</h2>
                            <p>{error}</p>
                            <button type="button" onClick={() => window.location.reload()}>
                                Try again
                            </button>
                        </div>
                    )}

                    {!loading && !error && filteredBookings.length === 0 && (
                        <div className="mb-state">
                            <i className="fa-solid fa-ticket"></i>
                            <h2>
                                {query ? "No matching bookings" : "No bookings here yet"}
                            </h2>
                            <p>
                                {query
                                    ? "Try a different PNR, train number or station name."
                                    : "Once you book a journey, it'll show up here for easy access."}
                            </p>
                            <button type="button" onClick={() => navigate("/")}>
                                Plan a journey
                            </button>
                        </div>
                    )}

                    {!loading && !error && filteredBookings.length > 0 && (
                        <>
                            <ul className="mb-list">
                                {visibleBookings.map((booking) => {
                                    const statusMeta = getStatusMeta(booking.bookingStatus);
                                    const { canCancel } = getCancelEligibility(booking);
                                    const isCancelling = cancellingToken === booking.token;

                                    return (
                                        <li
                                            className={`mb-card mb-card--${statusMeta.tone}`}
                                            key={booking.id || booking.token}
                                        >
                                            <div className="mb-card__main">
                                                <div className="mb-card__top">
                                                    <span
                                                        className={`mb-pill mb-pill--${statusMeta.tone}`}
                                                    >
                                                        {statusMeta.label}
                                                    </span>
                                                    <span className="mb-card__pnr">
                                                        PNR {booking.pnrNumber}
                                                    </span>
                                                </div>

                                                <div className="mb-card__route">
                                                    <span>{booking.journey?.fromStation}</span>
                                                    <i className="fa-solid fa-arrow-right-long"></i>
                                                    <span>{booking.journey?.toStation}</span>
                                                </div>

                                                <div className="mb-card__details">
                                                    <span>
                                                        <i className="fa-solid fa-train"></i>
                                                        {booking.train?.number}
                                                        {booking.train?.name
                                                            ? ` · ${booking.train.name}`
                                                            : ""}
                                                    </span>
                                                    <span>
                                                        <i className="fa-solid fa-calendar-day"></i>
                                                        {formatDate(booking.journey?.journeyDate)}
                                                    </span>
                                                    <span>
                                                        <i className="fa-solid fa-chair"></i>
                                                        {CLASS_NAMES[booking.journey?.classCode] ||
                                                            booking.journey?.classCode}
                                                    </span>
                                                    <span>
                                                        <i className="fa-solid fa-users"></i>
                                                        {booking.passengerCount} passenger
                                                        {booking.passengerCount === 1 ? "" : "s"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div
                                                className="mb-card__perforation"
                                                aria-hidden="true"
                                            ></div>

                                            <div className="mb-card__actions">
                                                <span className="mb-card__fare">
                                                    <small>Fare paid</small>
                                                    <strong>
                                                        ₹{booking.fare?.amount}{" "}
                                                        {booking.fare?.currency || ""}
                                                    </strong>
                                                </span>

                                                <div className="mb-card__buttons">
                                                    <Link
                                                        to={`/booking-success?token=${booking.token}`}
                                                        className="mb-btn"
                                                    >
                                                        <i className="fa-solid fa-eye"></i>
                                                        View
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        className="mb-btn"
                                                        onClick={() =>
                                                            openTicketAction(booking.token, "print")
                                                        }
                                                    >
                                                        <i className="fa-solid fa-print"></i>
                                                        Print
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="mb-btn mb-btn--primary"
                                                        onClick={() =>
                                                            openTicketAction(booking.token, "download")
                                                        }
                                                    >
                                                        <i className="fa-solid fa-download"></i>
                                                        Download
                                                    </button>
                                                    {canCancel && (
                                                        <button
                                                            type="button"
                                                            className="mb-btn mb-btn--danger"
                                                            disabled={isCancelling}
                                                            onClick={() =>
                                                                openCancelModal(booking)
                                                            }
                                                        >
                                                            <i className="fa-solid fa-ban"></i>
                                                            {isCancelling ? "Cancelling…" : "Cancel"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            {hasMore && (
                                <button
                                    type="button"
                                    className="mb-show-more"
                                    onClick={() =>
                                        setVisibleCount((count) => count + PAGE_SIZE)
                                    }
                                >
                                    Show more bookings
                                    <i className="fa-solid fa-chevron-down"></i>
                                </button>
                            )}
                        </>
                    )}
                </section>
            </main>

            {cancelTarget && (
                <div
                    className="mb-modal-overlay"
                    role="presentation"
                    onClick={closeCancelModal}
                >
                    <div
                        className="mb-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="mb-cancel-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-modal__header">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            <h2 id="mb-cancel-title">Cancel this booking?</h2>
                        </div>

                        <div className="mb-modal__body">
                            <p className="mb-modal__summary">
                                {cancelTarget.journey?.fromStation} →{" "}
                                {cancelTarget.journey?.toStation} on{" "}
                                {formatDate(cancelTarget.journey?.journeyDate)}
                                {cancelTarget.pnrNumber ? ` · PNR ${cancelTarget.pnrNumber}` : ""}
                            </p>

                            <p className="mb-modal__note">
                                Select who to cancel below. Refunds, where applicable,
                                follow the standard cancellation policy and this action
                                can't be undone.
                            </p>

                            {(() => {
                                const cancellablePassengers = cancelTarget.passengers.filter(
                                    (p) => p.status !== "CANCELLED"
                                );
                                const allSelected =
                                    cancellablePassengers.length > 0 &&
                                    selectedPassengers.length === cancellablePassengers.length;

                                const toggleSelectAll = () => {
                                    setCancelError("");
                                    setSelectedPassengers(
                                        allSelected
                                            ? []
                                            : cancellablePassengers.map((p) => p.id)
                                    );
                                };

                                return (
                                    <div className="mb-passenger-list">
                                        <div className="mb-passenger-list__head">
                                            <h5>Select Passengers</h5>
                                            <div className="mb-passenger-list__meta">
                                                <span className="mb-passenger-count">
                                                    {selectedPassengers.length} of{" "}
                                                    {cancellablePassengers.length} selected
                                                </span>
                                                {cancellablePassengers.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="mb-passenger-selectall"
                                                        disabled={Boolean(cancellingToken)}
                                                        onClick={toggleSelectAll}
                                                    >
                                                        {allSelected ? "Clear all" : "Select all"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mb-passenger-list__items">
                                            {cancelTarget.passengers.map((passenger) => {
                                                const cancelled = passenger.status === "CANCELLED";

                                                return (
                                                    <label
                                                        key={passenger.id}
                                                        className="mb-passenger-item"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            disabled={cancelled || Boolean(cancellingToken)}
                                                            checked={selectedPassengers.includes(passenger.id)}
                                                            onChange={() => {
                                                                setCancelError("");
                                                                setSelectedPassengers((prev) =>
                                                                    prev.includes(passenger.id)
                                                                        ? prev.filter((id) => id !== passenger.id)
                                                                        : [...prev, passenger.id]
                                                                );
                                                            }}
                                                        />

                                                        <span className="mb-passenger-item__name">
                                                            {passenger.name}
                                                        </span>

                                                        <small>
                                                            {passenger.age} yrs • {passenger.gender}
                                                        </small>

                                                        {passenger.seatNumber ? (
                                                            <strong>{passenger.seatNumber}</strong>
                                                        ) : (
                                                            <strong className="mb-passenger-item__pending">
                                                                {passenger.reservationStatus === "RAC" ? "RAC" : "WL"}
                                                            </strong>
                                                        )}

                                                        {cancelled && (
                                                            <span className="text-danger">Cancelled</span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            <label className="mb-modal__label" htmlFor="mb-cancel-reason">
                                Reason (optional)
                            </label>
                            <textarea
                                id="mb-cancel-reason"
                                className="mb-modal__textarea"
                                rows={3}
                                maxLength={200}
                                placeholder="Let us know why you're cancelling"
                                value={cancelReason}
                                disabled={Boolean(cancellingToken)}
                                onChange={(event) => setCancelReason(event.target.value)}
                            />

                            {cancelError && (
                                <p className="mb-modal__error">
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    {cancelError}
                                </p>
                            )}
                        </div>

                        <div className="mb-modal__actions">
                            <button
                                type="button"
                                className="mb-btn"
                                disabled={Boolean(cancellingToken)}
                                onClick={closeCancelModal}
                            >
                                Keep booking
                            </button>
                            <button
                                type="button"
                                className="mb-btn mb-btn--danger"
                                disabled={Boolean(cancellingToken) || selectedPassengers.length === 0}
                                onClick={confirmCancelBooking}
                            >
                                {cancellingToken ? "Cancelling…" : "Yes, cancel booking"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`mb-toast mb-toast--${toast.tone}`} role="status">
                    <i
                        className={`fa-solid ${toast.tone === "ok" ? "fa-circle-check" : "fa-circle-exclamation"
                            }`}
                    ></i>
                    {toast.message}
                </div>
            )}

            <Footer />
        </>
    );
}

export default MyBookings;