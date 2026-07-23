import React, {
    useEffect,
    useState
} from "react";

import axios from "axios";
import { API_BASE_URL } from "../config/api";

import {
    useNavigate,
    useSearchParams
} from "react-router-dom";

import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";

import "../Styles/Review.css";

import useDocumentTitle from "../hooks/useDocumentTitle";


const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "Chair Car",
    EC: "Executive Chair Car"
};

const STEPS = [
    { label: "Search", icon: "fa-magnifying-glass" },
    { label: "Passenger", icon: "fa-user" },
    { label: "Seats", icon: "fa-couch" },
    { label: "Review", icon: "fa-eye" },
    { label: "Payment", icon: "fa-credit-card" }
];

function getGenderIcon(gender) {

    const value = (gender || "").toLowerCase();

    if (value.startsWith("m")) return "fa-solid fa-mars";
    if (value.startsWith("f")) return "fa-solid fa-venus";

    return "fa-solid fa-venus-mars";
}

function ReviewBooking() {

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const token = searchParams.get("token");

    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState("");
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState("");

    useDocumentTitle("RailGo - Review Booking");

    useEffect(() => {

        const loadBooking = async () => {

            try {

                const response = await axios.get(
                    `${API_BASE_URL}/bookings/${token}`
                );

                setBooking(response.data.booking);

            } catch (error) {

                console.error(error);

            } finally {

                setLoading(false);
            }
        };

        loadBooking();

    }, [token]);

    useEffect(() => {

        if (!booking?.expiresAt) return;

        const interval = setInterval(() => {

            const remaining =
                new Date(booking.expiresAt) - new Date();

            if (remaining <= 0) {

                setTimeLeft("Expired");

                clearInterval(interval);

                return;
            }

            const minutes =
                Math.floor(remaining / 60000);

            const seconds =
                Math.floor((remaining % 60000) / 1000);

            setTimeLeft(
                `${minutes}:${seconds
                    .toString()
                    .padStart(2, "0")}`
            );

        }, 1000);

        return () => clearInterval(interval);

    }, [booking]);

    const formatDate = (dateString) => {

        return new Date(dateString).toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                weekday: "short"
            }
        );
    };

    if (loading) {

        return (
            <>
                <Navbar />

                <div className="review-loading">
                    <i className="fa-solid fa-circle-notch fa-spin me-2"></i>
                    Loading Booking Details...
                </div>

                <Footer />
            </>
        );
    }

    if (!booking) {

        return (
            <>
                <Navbar />

                <div className="review-loading">
                    <i className="fa-solid fa-triangle-exclamation me-2"></i>
                    Booking Not Found
                </div>

                <Footer />
            </>
        );
    }

    // Fare is shown as a transparent breakdown that always sums to the
    // booking's actual totalFare, so nothing here changes what gets charged.
    const convenienceFee = Math.round((booking.totalFare || 0) * 0.02);
    const gst = Math.round(convenienceFee * 0.18);
    const baseFare = (booking.totalFare || 0) - convenienceFee - gst;

    const isLowTime = timeLeft !== "Expired" &&
        timeLeft.split(":")[0] !== undefined &&
        parseInt(timeLeft.split(":")[0], 10) < 2 &&
        timeLeft !== "";

    const proceedToPayment = async () => {
        setReviewSubmitting(true);
        setReviewError("");

        try {
            await axios.patch(`${API_BASE_URL}/bookings/${token}/review`);
            navigate(`/payment?token=${token}`);
        } catch (error) {
            setReviewError(
                error.response?.data?.message ||
                "Unable to complete review. Please try again."
            );
        } finally {
            setReviewSubmitting(false);
        }
    };

    return (
        <>
            <Navbar />

            <main className="review-page">

                <div className="container">

                    {/* HEADER */}

                    <div className="review-header">

                        <div className="review-header-top">

                            <div>
                                <h2>
                                    Review Booking
                                </h2>

                                <p>
                                    Verify all details before payment
                                </p>
                            </div>

                            {token && (
                                <span className="pnr-badge">
                                    <i className="fa-solid fa-ticket me-2"></i>
                                    REF: {token.slice(0, 10).toUpperCase()}
                                </span>
                            )}

                        </div>

                    </div>

                    {/* STEPPER */}

                    <div className="booking-stepper">

                        {STEPS.map((step, index) => {

                            const isSeatsStep = index === 2;
                            const seatsSkipped =
                                isSeatsStep && booking.bookingType && booking.bookingType !== "CONFIRMED";

                            const status =
                                seatsSkipped
                                    ? "skipped"
                                    : index < 3
                                        ? "completed"
                                        : index === 3
                                            ? "active"
                                            : "";

                            return (
                                <div
                                    key={step.label}
                                    className={`step ${status}`}
                                >
                                    <i className={`fa-solid ${seatsSkipped ? "fa-ban" : step.icon}`}></i>
                                    <span>{seatsSkipped ? "Seats Skipped" : step.label}</span>
                                </div>
                            );
                        })}

                    </div>

                    <div className="row g-4">

                        {/* LEFT */}

                        <div className="col-lg-8">

                            {/* Journey */}

                            <div className="review-card journey-card">

                                <div className="journey-top">

                                    <div>

                                        <h4>
                                            <i className="fa-solid fa-train me-2"></i>
                                            Train {booking.trainNo}
                                        </h4>

                                        <p>
                                            {CLASS_NAMES[booking.classCode] || booking.classCode}
                                        </p>

                                    </div>

                                    <span className="confirmed-tag">
                                        <i className="fa-solid fa-circle-check me-2"></i>
                                        Awaiting Payment
                                    </span>

                                </div>

                                <div className="journey-route">

                                    <div>

                                        <h3>
                                            {booking.fromStation}
                                        </h3>

                                        <small>
                                            <i className="fa-solid fa-circle-dot me-1"></i>
                                            Boarding Station
                                        </small>

                                    </div>

                                    <div className="route-arrow">

                                        <i className="fa-solid fa-arrow-right-long"></i>

                                    </div>

                                    <div>

                                        <h3>
                                            {booking.toStation}
                                        </h3>

                                        <small>
                                            <i className="fa-solid fa-location-dot me-1"></i>
                                            Destination
                                        </small>

                                    </div>

                                </div>

                                <div className="journey-footer">

                                    <span>
                                        <i className="fa-solid fa-calendar-days me-2"></i>
                                        {formatDate(booking.journeyDate)}
                                    </span>

                                    <span>
                                        <i className="fa-solid fa-chair me-2"></i>
                                        {booking.passengers?.length || 0} Passenger(s)
                                    </span>

                                </div>

                            </div>

                            {/* PASSENGERS */}

                            <div className="review-card">

                                <h5 className="section-title">

                                    <i className="fa-solid fa-user-group me-2"></i>

                                    Passenger Details

                                </h5>

                                {
                                    booking.passengers.map(
                                        (
                                            passenger,
                                            index
                                        ) => (

                                            <div
                                                key={index}
                                                className="passenger-card"
                                            >

                                                <div className="passenger-avatar">
                                                    <i className={getGenderIcon(passenger.gender)}></i>
                                                </div>

                                                <div className="passenger-info">

                                                    <strong>
                                                        {passenger.name}
                                                    </strong>

                                                    <span className="passenger-meta">
                                                        <i className="fa-solid fa-cake-candles me-1"></i>
                                                        {passenger.age} yrs
                                                        <span className="dot">•</span>
                                                        {passenger.gender}
                                                    </span>

                                                </div>

                                                {passenger.seatNumber ? (
                                                    <span className="seat-pill">
                                                        <i className="fa-solid fa-couch me-1"></i>
                                                        {passenger.seatNumber}
                                                    </span>
                                                ) : (
                                                    <span className="seat-pill seat-pill-pending">
                                                        <i className="fa-solid fa-hourglass-half me-1"></i>
                                                        {passenger.reservationStatus === "RAC" ? "RAC" : "Waitlisted"}
                                                    </span>
                                                )}

                                            </div>
                                        )
                                    )
                                }

                            </div>

                            {/* SEATS */}

                            {booking.bookingType && booking.bookingType !== "CONFIRMED" ? (

                                <div className="review-card">

                                    <h5 className="section-title">

                                        <i className="fa-solid fa-hourglass-half me-2"></i>

                                        Seat Allotment

                                    </h5>

                                    <div className="info-box mb-0">
                                        <p className="mb-0">
                                            <i className="fa-solid fa-circle-info me-2"></i>
                                            Seats were not available for this journey at the time of
                                            booking, so seat selection was skipped. Your booking is
                                            currently{" "}
                                            <strong>
                                                {booking.bookingType === "RAC" ? "RAC (Reservation Against Cancellation)" : "Waitlisted (WL)"}
                                            </strong>
                                            . A seat will be allotted automatically if one becomes
                                            available before chart preparation.
                                        </p>
                                    </div>

                                </div>

                            ) : (

                                <div className="review-card">

                                    <h5 className="section-title">

                                        <i className="fa-solid fa-couch me-2"></i>

                                        Selected Seats

                                    </h5>

                                    <div className="seat-container">

                                        {
                                            (booking.selectedSeats || []).map(
                                                (
                                                    seat
                                                ) => (

                                                    <span
                                                        key={seat}
                                                        className="seat-badge"
                                                    >
                                                        <i className="fa-solid fa-chair me-2"></i>
                                                        {seat}
                                                    </span>
                                                )
                                            )
                                        }

                                    </div>

                                </div>
                            )}

                            {/* CONTACT */}

                            <div className="review-card">

                                <h5 className="section-title">

                                    <i className="fa-solid fa-phone me-2"></i>

                                    Contact Information

                                </h5>

                                <p>

                                    <i className="fa-solid fa-mobile-screen-button me-2"></i>

                                    <strong>
                                        Mobile:
                                    </strong>

                                    {" "}
                                    {booking.contact?.mobile}

                                </p>

                                <p>

                                    <i className="fa-solid fa-envelope me-2"></i>

                                    <strong>
                                        Email:
                                    </strong>

                                    {" "}
                                    {booking.contact?.email}

                                </p>

                                <small className="contact-note">
                                    <i className="fa-solid fa-circle-info me-1"></i>
                                    Your ticket and updates will be sent here.
                                </small>

                            </div>

                            {/* INFO */}

                            <div className="info-box">

                                <h6>
                                    <i className="fa-solid fa-circle-info me-2"></i>
                                    Before You Proceed
                                </h6>

                                <ul>

                                    <li>
                                        Carry a valid original photo ID matching the passenger name during the journey.
                                    </li>

                                    <li>
                                        Arrive at the boarding station at least 30 minutes before departure.
                                    </li>

                                    <li>
                                        Seat allotment is confirmed only after successful payment.
                                    </li>

                                </ul>

                            </div>

                        </div>

                        {/* RIGHT */}

                        <div className="col-lg-4">

                            <div className="fare-sidebar">

                                <div className={`timer-box ${isLowTime ? "timer-low" : ""}`}>

                                    <i className="fa-solid fa-clock me-2"></i>

                                    {timeLeft || "--:--"}

                                    <small>Time left to complete booking</small>

                                </div>

                                <div className="fare-card">

                                    <h4>
                                        <i className="fa-solid fa-receipt me-2"></i>
                                        Fare Summary
                                    </h4>

                                    <div className="fare-row">

                                        <span>
                                            Base Fare × {booking.passengers.length}
                                        </span>

                                        <span>
                                            ₹{baseFare}
                                        </span>

                                    </div>

                                    <div className="fare-row">

                                        <span>
                                            Convenience Fee
                                        </span>

                                        <span>
                                            ₹{convenienceFee}
                                        </span>

                                    </div>

                                    <div className="fare-row">

                                        <span>
                                            GST (18%)
                                        </span>

                                        <span>
                                            ₹{gst}
                                        </span>

                                    </div>

                                    <hr />

                                    <div className="fare-total">

                                        <span>
                                            Total
                                        </span>

                                        <span>
                                            ₹{booking.totalFare}
                                        </span>

                                    </div>

                                    {(!booking.bookingType || booking.bookingType === "CONFIRMED") && (
                                        <button
                                            className="btn btn-outline-secondary w-100 mt-4"
                                            onClick={() =>
                                                navigate(-1)
                                            }
                                        >
                                            <i className="fa-solid fa-arrow-left me-2"></i>
                                            Change Seats
                                        </button>
                                    )}

                                    <button
                                        className="payment-btn mt-3"
                                        onClick={proceedToPayment}
                                        disabled={reviewSubmitting}
                                    >
                                        {reviewSubmitting
                                            ? "Saving Review..."
                                            : "Proceed To Payment"}

                                        {!reviewSubmitting && (
                                            <i className="fa-solid fa-arrow-right ms-2"></i>
                                        )}

                                    </button>

                                    {reviewError && (
                                        <small className="text-danger d-block mt-2">
                                            {reviewError}
                                        </small>
                                    )}

                                    <small className="terms-note">
                                        By continuing, you agree to our Terms &amp; Refund Policy.
                                    </small>

                                </div>

                                <div className="security-box">

                                    <h6>
                                        <i className="fa-solid fa-shield-halved me-2"></i>
                                        100% Secure Booking
                                    </h6>

                                    <p>
                                        Your information is encrypted and protected at every step.
                                    </p>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>

            </main>

            <Footer />
        </>
    );
}

export default ReviewBooking;