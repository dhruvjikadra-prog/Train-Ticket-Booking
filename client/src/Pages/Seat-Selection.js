import React, {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import "../Styles/Seat-Selection.css";
import useDocumentTitle from "../hooks/useDocumentTitle";


const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "AC Chair Car",
    EC: "Executive Chair Car"
};

const formatDate = (value) => {
    if (!value) return "—";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

const LOW_AVAILABILITY_THRESHOLD = 10;

const getAvailabilityMeta = (availableSeats) => {
    const count = Number(availableSeats) || 0;

    if (count <= 0) {
        return { label: "Sold out", tone: "none" };
    }

    if (count <= LOW_AVAILABILITY_THRESHOLD) {
        return { label: `${count} left`, tone: "low" };
    }

    return { label: `${count} available`, tone: "ok" };
};

const groupSeatsByRow = (seats = []) => {
    const rows = new Map();

    seats.forEach((seat) => {
        if (!rows.has(seat.row)) rows.set(seat.row, []);
        rows.get(seat.row).push(seat);
    });

    return Array.from(rows.entries())
        .sort(([rowA], [rowB]) => rowA - rowB)
        .map(([row, rowSeats]) => ({
            row,
            seats: rowSeats.sort((a, b) => a.column - b.column)
        }));
};

function SeatButton({ seat, selected, onToggle }) {
    const unavailable =
        seat.status === "BOOKED" ||
        seat.status === "BLOCKED" ||
        (seat.status === "HELD" && !seat.heldByCurrentBooking);
    const statusClass = selected
        ? "selected"
        : seat.status.toLowerCase();

    return (
        <button
            type="button"
            className={`ss-seat ss-seat--${statusClass}`}
            disabled={unavailable}
            onClick={() => onToggle(seat)}
            title={`${seat.seatCode} · ${seat.berthType} · ${seat.status}`}
            aria-label={`${seat.seatCode}, ${seat.berthType}, ${seat.status}`}
        >
            <span className="ss-seat-number">{seat.seatNumber}</span>
            <span className="ss-seat-berth">{seat.berthCode}</span>
        </button>
    );
}

function SeatCluster({ seats, selectedSeats, onToggle, className }) {
    return (
        <div className={`ss-seat-cluster ${className || ""}`}>
            {seats.map((seat) => (
                <SeatButton
                    key={seat.seatCode}
                    seat={seat}
                    selected={selectedSeats.includes(seat.seatCode)}
                    onToggle={onToggle}
                />
            ))}
        </div>
    );
}

function CoachInterior({ coach, selectedSeats, onToggle }) {
    const rows = useMemo(
        () => groupSeatsByRow(coach?.seats),
        [coach]
    );

    if (!coach) return null;

    const availability = getAvailabilityMeta(coach.availableSeats);

    return (
        <div className={`ss-coach-interior ss-layout--${coach.layoutType}`}>
            <div className="ss-coach-roof">
                <span>{coach.coachCode}</span>
                <strong>{CLASS_NAMES[coach.classCode] || coach.classCode}</strong>
                <span
                    className={`ss-coach-availability ss-coach-availability--${availability.tone}`}
                >
                    {availability.label}
                </span>
            </div>

            <div className="ss-interior-body">
                {rows.map(({ row, seats }) => {
                    const leftSeats = seats.filter(
                        (seat) => seat.side === "LEFT"
                    );
                    const rightSeats = seats.filter(
                        (seat) => seat.side === "RIGHT"
                    );
                    const sideSeats = seats.filter(
                        (seat) => seat.side === "SIDE"
                    );

                    return (
                        <div className="ss-seat-row" key={row}>
                            <span className="ss-row-label">
                                {coach.layoutType.startsWith("CHAIR")
                                    ? `Row ${row}`
                                    : `Bay ${row}`}
                            </span>
                            <SeatCluster
                                seats={leftSeats}
                                selectedSeats={selectedSeats}
                                onToggle={onToggle}
                                className="ss-seat-cluster--left"
                            />
                            <div className="ss-aisle">
                                <span></span>
                            </div>
                            <SeatCluster
                                seats={rightSeats}
                                selectedSeats={selectedSeats}
                                onToggle={onToggle}
                                className="ss-seat-cluster--right"
                            />
                            {sideSeats.length > 0 && (
                                <>
                                    <div className="ss-side-divider" />
                                    <SeatCluster
                                        seats={sideSeats}
                                        selectedSeats={selectedSeats}
                                        onToggle={onToggle}
                                        className="ss-seat-cluster--side"
                                    />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="ss-coach-floor">
                <span className="ss-door">Door</span>
                <span className="ss-direction">
                    Direction of travel
                    <i className="fa-solid fa-arrow-right-long"></i>
                </span>
                <span className="ss-door">Door</span>
            </div>
        </div>
    );
}

function SeatSelection() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token");

    const [booking, setBooking] = useState(null);
    const [coaches, setCoaches] = useState([]);
    const [activeCoach, setActiveCoach] = useState(null);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [allowedCoachPrefix, setAllowedCoachPrefix] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [showPartialConfirm, setShowPartialConfirm] = useState(false);

    useDocumentTitle("RailGo - Seat Selection");

    const loadSeatSelection = useCallback(async () => {
        if (!token) {
            setError("Booking token is missing.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError("");

        try {
            const [bookingResponse, coachResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/bookings/${token}`),
                axios.get(`${API_BASE_URL}/seats/coaches/${token}`)
            ]);

            const bookingData = bookingResponse.data.booking;
            const coachData = coachResponse.data;

            // Seats were unavailable when this booking was created (RAC/WL),
            // so Seat Selection doesn't apply — go straight to Review.
            if (bookingData?.bookingType && bookingData.bookingType !== "CONFIRMED") {
                navigate(`/review?token=${token}`, { replace: true });
                return;
            }

            setBooking(bookingData);
            setCoaches(coachData.coaches || []);
            setAllowedCoachPrefix(coachData.allowedCoachPrefix || "");
            setSelectedSeats(coachData.selectedSeats || []);
            setActiveCoach((currentCoach) => {
                const stillExists = coachData.coaches?.some(
                    (coach) => coach.coachCode === currentCoach
                );
                return stillExists
                    ? currentCoach
                    : coachData.coaches?.[0]?.coachCode || null;
            });
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                "Unable to load the coach seat map."
            );
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadSeatSelection();
    }, [loadSeatSelection]);

    const activeCoachData = useMemo(
        () => coaches.find((coach) => coach.coachCode === activeCoach) || null,
        [coaches, activeCoach]
    );

    const seatLimit = booking?.passengers?.length || 0;
    const classCode = booking?.classCode || "";

    // Total seats currently selectable across every compatible coach
    // (AVAILABLE, plus any already held by this booking). This can be
    // lower than seatLimit — e.g. 1 seat left for 2 passengers — in which
    // case the shortfall is made up as waitlisted (WL) passengers.
    const totalAvailableSeats = useMemo(
        () =>
            coaches.reduce(
                (sum, coach) => sum + (coach.availableSeats || 0),
                0
            ),
        [coaches]
    );

    const effectiveSeatLimit = Math.max(
        0,
        Math.min(seatLimit, totalAvailableSeats)
    );
    const isShortOnSeats = effectiveSeatLimit < seatLimit;
    const willBeWaitlisted = seatLimit - selectedSeats.length;

    const toggleSeat = (seat) => {
        const unavailable =
            seat.status === "BOOKED" ||
            seat.status === "BLOCKED" ||
            (seat.status === "HELD" && !seat.heldByCurrentBooking);

        if (unavailable) return;

        setSaved(false);
        setSelectedSeats((currentSeats) => {
            if (currentSeats.includes(seat.seatCode)) {
                return currentSeats.filter(
                    (seatCode) => seatCode !== seat.seatCode
                );
            }

            if (currentSeats.length >= effectiveSeatLimit) {
                return currentSeats;
            }

            return [...currentSeats, seat.seatCode];
        });
    };

    const submitSelectedSeats = async () => {
        setSaving(true);
        setError("");

        try {
            const response = await axios.patch(
                `${API_BASE_URL}/bookings/${token}/seats`,
                { selectedSeats }
            );

            setSelectedSeats(response.data.selectedSeats || selectedSeats);
            navigate(`/review?token=${token}`);
        } catch (requestError) {
            setError(
                requestError.response?.data?.message ||
                "Unable to reserve the selected seats."
            );
            await loadSeatSelection();
        } finally {
            setSaving(false);
            setShowPartialConfirm(false);
        }
    };

    const reserveSeats = async () => {
        if (selectedSeats.length === 0 || selectedSeats.length > seatLimit) {
            return;
        }

        // Fewer seats selected than passengers means some passenger(s)
        // will be waitlisted — confirm with the person before submitting.
        if (selectedSeats.length < seatLimit) {
            setShowPartialConfirm(true);
            return;
        }

        await submitSelectedSeats();
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <main className="ss-state-page">
                    <div className="ss-spinner" />
                    <h2>Preparing your train coach…</h2>
                    <p>Loading live seat status for this journey.</p>
                </main>
                <Footer />
            </>
        );
    }

    if (error && !booking) {
        return (
            <>
                <Navbar />
                <main className="ss-state-page ss-state-page--error">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <h2>Seat map unavailable</h2>
                    <p>{error}</p>
                    <button type="button" onClick={() => navigate(-1)}>
                        Go Back
                    </button>
                </main>
                <Footer />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <main className="ss-page">
                <section className="ss-hero">
                    <button
                        type="button"
                        className="ss-back"
                        onClick={() => navigate(-1)}
                    >
                        <i className="fa-solid fa-arrow-left"></i>
                        Passenger details
                    </button>

                    <div className="ss-hero-content">
                        <div>
                            <span className="ss-kicker">Choose your place</span>
                            <h1>Select seats inside the train</h1>
                            <p>
                                Only <strong>{allowedCoachPrefix}-series</strong>{" "}
                                coaches are available for your{" "}
                                <strong>{CLASS_NAMES[classCode]}</strong> booking.
                            </p>
                        </div>

                        <div className="ss-trip-card">
                            <span>Train {booking?.trainNo}</span>
                            <strong>
                                {booking?.fromStation}
                                <i className="fa-solid fa-arrow-right-long"></i>
                                {booking?.toStation}
                            </strong>
                            <small>
                                {formatDate(booking?.journeyDate)} ·{" "}
                                {CLASS_NAMES[classCode] || classCode}
                            </small>
                        </div>
                    </div>
                </section>

                <section className="ss-workspace">
                    {error && (
                        <div className="ss-alert">
                            <i className="fa-solid fa-circle-exclamation"></i>
                            {error}
                        </div>
                    )}

                    {saved && (
                        <div className="ss-alert ss-alert--success">
                            <i className="fa-solid fa-circle-check"></i>
                            Seats reserved for 15 minutes. Booking references
                            are stored against each selected coach seat.
                        </div>
                    )}

                    <div className="ss-section-heading">
                        <div>
                            <span>Step 1</span>
                            <h2>Pick a coach</h2>
                        </div>
                        <p>
                            {coaches.length} compatible coach
                            {coaches.length === 1 ? "" : "es"}
                        </p>
                    </div>

                    <div className="ss-train-scroll">
                        <div className="ss-train">
                            <div className="ss-engine" aria-label="Train engine">
                                <div className="ss-engine-window" />
                                <div className="ss-engine-light" />
                                <span>{booking?.trainNo}</span>
                                <i className="fa-solid fa-train"></i>
                            </div>

                            {coaches.map((coach) => {
                                const availability = getAvailabilityMeta(
                                    coach.availableSeats
                                );

                                return (
                                    <React.Fragment key={coach.coachCode}>
                                        <div className="ss-coupler" />
                                        <button
                                            type="button"
                                            className={`ss-train-coach ${activeCoach === coach.coachCode
                                                ? "active"
                                                : ""
                                                }`}
                                            onClick={() =>
                                                setActiveCoach(coach.coachCode)
                                            }
                                        >
                                            <span className="ss-coach-code">
                                                {coach.coachCode}
                                            </span>
                                            <span className="ss-coach-windows">
                                                <i></i><i></i><i></i><i></i>
                                            </span>
                                            <span
                                                className={`ss-coach-availability ss-coach-availability--${availability.tone}`}
                                            >
                                                {availability.label}
                                            </span>
                                            <span className="ss-coach-wheels">
                                                <i></i><i></i>
                                            </span>
                                        </button>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    <div className="ss-section-heading ss-seat-heading">
                        <div>
                            <span>Step 2</span>
                            <h2>
                                Select {effectiveSeatLimit} seat
                                {effectiveSeatLimit === 1 ? "" : "s"} in{" "}
                                {activeCoach || "your coach"}
                            </h2>
                        </div>

                        <div className="ss-legend">
                            <span className="available">Available</span>
                            <span className="selected">Selected</span>
                            <span className="held">Held</span>
                            <span className="booked">Booked</span>
                            <span className="blocked">Blocked</span>
                        </div>
                    </div>

                    {isShortOnSeats && (
                        <div className="ss-alert ss-alert--warning">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                            Only {totalAvailableSeats} of {seatLimit} seat
                            {seatLimit === 1 ? "" : "s"} {totalAvailableSeats === 1 ? "is" : "are"} available
                            for this class. You can reserve {effectiveSeatLimit} now — the
                            remaining {seatLimit - effectiveSeatLimit} passenger
                            {seatLimit - effectiveSeatLimit === 1 ? "" : "s"} will be waitlisted (WL) and
                            allotted a seat automatically if one frees up.
                        </div>
                    )}

                    <CoachInterior
                        coach={activeCoachData}
                        selectedSeats={selectedSeats}
                        onToggle={toggleSeat}
                    />
                </section>

                <aside className="ss-selection-bar">
                    <div className="ss-selection-copy">
                        <span>
                            Selected {selectedSeats.length}/{effectiveSeatLimit}
                        </span>
                        <div className="ss-selected-tags">
                            {selectedSeats.length > 0
                                ? selectedSeats.map((seatCode, index) => (
                                    <span key={seatCode}>
                                        <small>
                                            {booking?.passengers?.[index]?.name ||
                                                `Passenger ${index + 1}`}
                                        </small>
                                        <strong>{seatCode}</strong>
                                    </span>
                                ))
                                : <em>Select seats from the coach layout</em>}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="ss-reserve-button"
                        disabled={
                            saving ||
                            selectedSeats.length === 0 ||
                            selectedSeats.length !== effectiveSeatLimit ||
                            saved
                        }
                        onClick={reserveSeats}
                    >
                        {saving
                            ? "Reserving…"
                            : saved
                                ? "Seats Reserved"
                                : isShortOnSeats
                                    ? "Reserve & Continue"
                                    : "Reserve Selected Seats"}
                        {!saving && !saved && (
                            <i className="fa-solid fa-arrow-right"></i>
                        )}
                    </button>
                </aside>
            </main>

            {showPartialConfirm && (
                <div
                    className="ss-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ss-partial-confirm-title"
                >
                    <div className="ss-modal">
                        <div className="ss-modal-icon">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <h3 id="ss-partial-confirm-title">
                            Only {selectedSeats.length} seat
                            {selectedSeats.length === 1 ? "" : "s"} available
                        </h3>
                        <p>
                            You've selected {selectedSeats.length} of {seatLimit} seat
                            {seatLimit === 1 ? "" : "s"}. The remaining{" "}
                            <strong>{willBeWaitlisted}</strong> passenger
                            {willBeWaitlisted === 1 ? "" : "s"} will be marked{" "}
                            <strong>Waitlisted (WL)</strong> and automatically allotted a
                            seat if one becomes available before chart preparation.
                        </p>
                        <p>Do you want to continue with this booking?</p>
                        <div className="ss-modal-actions">
                            <button
                                type="button"
                                className="ss-modal-cancel"
                                onClick={() => setShowPartialConfirm(false)}
                                disabled={saving}
                            >
                                Go Back
                            </button>
                            <button
                                type="button"
                                className="ss-modal-confirm"
                                onClick={submitSelectedSeats}
                                disabled={saving}
                            >
                                {saving ? "Confirming…" : "Yes, Continue"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    );
}

export default SeatSelection;