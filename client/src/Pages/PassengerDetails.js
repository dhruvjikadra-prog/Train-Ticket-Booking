import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import JourneyLoader from "../Components/JourneyLoader";
import { withMinimumDuration } from "../utils/loading";
import "../Styles/PassengerDetails.css";
import useDocumentTitle from "../hooks/useDocumentTitle";

const MAX_PASSENGERS = 6;

const safeJsonParse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch (error) {
        return null;
    }
};

const toBookingPassenger = (passenger) => ({
    name: passenger.name || "",
    age: passenger.age ? String(passenger.age) : "",
    gender: passenger.gender || "",
    seniorCitizen: Boolean(passenger.seniorCitizen)
});

const isEmptyPassenger = (passenger) =>
    !passenger.name && !passenger.age && !passenger.gender && !passenger.seniorCitizen;

function PassengerDetails() {
    useDocumentTitle("RailGo - Passenger Details");

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const trainId = searchParams.get("trainId");
    const trainNo = searchParams.get("trainNo");
    const fromCode = searchParams.get("from");
    const toCode = searchParams.get("to");
    const journeyDate = searchParams.get("date");
    const classCode = searchParams.get("class");
    const bookingType = searchParams.get("bookingType") || "CONFIRMED";

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [train, setTrain] = useState(null);
    const [pageError, setPageError] = useState("");
    const [submitError, setSubmitError] = useState("");

    const [contact, setContact] = useState({ mobile: "", email: "" });
    const [savedPassengers, setSavedPassengers] = useState([]);

    const [errors, setErrors] = useState({ contact: {}, passengers: [] });

    const [passengers, setPassengers] = useState([
        { name: "", age: "", gender: "", seniorCitizen: false }
    ]);

    const userData = useMemo(() => safeJsonParse(localStorage.getItem("user")) || {}, []);
    const userId = userData._id || userData.id;

    /* ── Fetch train details ───────────────────────────────── */
    useEffect(() => {
        const fetchTrain = async () => {
            if (
                !trainId ||
                !trainNo ||
                !fromCode ||
                !toCode ||
                !journeyDate ||
                !classCode
            ) {
                setPageError(
                    "Journey information is incomplete. Please search for a train again."
                );
                setLoading(false);
                return;
            }

            try {
                const res = await withMinimumDuration(
                    axios.get(`${API_BASE_URL}/trains/${trainId}`)
                );
                setTrain(res.data.train);
            } catch (error) {
                setPageError(
                    error.response?.data?.message ||
                    "Unable to load the selected train."
                );
            } finally {
                setLoading(false);
            }
        };
        fetchTrain();
    }, [classCode, fromCode, journeyDate, toCode, trainId, trainNo]);

    useEffect(() => {
        const fetchUserProfile = async () => {
            const token = localStorage.getItem("token");
            if (!token) return;

            try {
                const res = await axios.get(`${API_BASE_URL}/users/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                const profile = res.data.user || {};
                setSavedPassengers(profile.savedPassengers || []);
                setContact((prev) => ({
                    mobile: prev.mobile || profile.mobile || "",
                    email: prev.email || profile.email || ""
                }));
            } catch (error) {
                setSavedPassengers([]);
            }
        };

        fetchUserProfile();
    }, []);

    /* ── Derived values ────────────────────────────────────── */
    const boardingStation = useMemo(() => {
        if (!train?.route) return null;
        return train.route.find(s => s.stationCode === fromCode);
    }, [train, fromCode]);

    const droppingStation = useMemo(() => {
        if (!train?.route) return null;
        return train.route.find(s => s.stationCode === toCode);
    }, [train, toCode]);

    const selectedClass = useMemo(() => {
        if (!train?.classes) return null;
        return train.classes.find(cls => cls.code === classCode);
    }, [train, classCode]);

    const distance = useMemo(() => {
        if (!boardingStation || !droppingStation) return 0;
        return droppingStation.distance - boardingStation.distance;
    }, [boardingStation, droppingStation]);

    const farePerPassenger = useMemo(() => {
        if (!selectedClass) return 0;
        return Math.round(selectedClass.farePerKm * distance);
    }, [selectedClass, distance]);

    const totalFare = farePerPassenger * passengers.length;

    /* ── Passenger helpers ─────────────────────────────────── */
    const addPassenger = () => {
        if (passengers.length >= MAX_PASSENGERS) {
            alert("Maximum 6 passengers allowed.");
            return;
        }
        setPassengers([
            ...passengers,
            { name: "", age: "", gender: "", seniorCitizen: false }
        ]);
    };

    const removePassenger = (index) => {
        if (passengers.length === 1) return;
        setPassengers(passengers.filter((_, i) => i !== index));
    };

    const updatePassenger = (index, field, value) => {
        const updated = [...passengers];
        updated[index][field] = value;
        setPassengers(updated);
        setErrors(prev => ({
            ...prev,
            passengers: prev.passengers.map((item, i) =>
                i !== index ? item || {} : { ...item, [field]: "" }
            )
        }));
    };

    const applySavedPassenger = (savedPassenger) => {
        const nextPassenger = toBookingPassenger(savedPassenger);
        const hasEmptySlot = passengers.some(isEmptyPassenger);

        if (!hasEmptySlot && passengers.length >= MAX_PASSENGERS) {
            setSubmitError("Maximum 6 passengers allowed.");
            return;
        }

        setSubmitError("");

        setPassengers((prev) => {
            const emptyIndex = prev.findIndex(isEmptyPassenger);

            if (emptyIndex >= 0) {
                const next = [...prev];
                next[emptyIndex] = nextPassenger;
                return next;
            }

            return [...prev, nextPassenger];
        });

        setErrors((prev) => ({
            ...prev,
            passengers: []
        }));
    };

    const clearContactError = (field) => {
        setErrors(prev => ({
            ...prev,
            contact: { ...prev.contact, [field]: "" }
        }));
    };

    /* ── Validation ────────────────────────────────────────── */
    const validateForm = () => {
        const newErrors = {
            contact: {},
            passengers: passengers.map(() => ({}))
        };
        let valid = true;

        const mobilePattern = /^[6-9]\d{9}$/;
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const namePattern = /^[\p{L}][\p{L}\s.'-]{1,59}$/u;

        if (!contact.mobile.trim()) {
            newErrors.contact.mobile = "Mobile number is required.";
            valid = false;
        } else if (!mobilePattern.test(contact.mobile.trim())) {
            newErrors.contact.mobile = "Enter a valid 10-digit mobile number.";
            valid = false;
        }

        if (!contact.email.trim()) {
            newErrors.contact.email = "Email address is required.";
            valid = false;
        } else if (!emailPattern.test(contact.email.trim())) {
            newErrors.contact.email = "Enter a valid email address.";
            valid = false;
        }

        passengers.forEach((passenger, index) => {
            if (!passenger.name.trim()) {
                newErrors.passengers[index].name = "Passenger name is required.";
                valid = false;
            } else if (!namePattern.test(passenger.name.trim())) {
                newErrors.passengers[index].name =
                    "Use 2–60 letters; spaces, apostrophes, dots, and hyphens are allowed.";
                valid = false;
            }
            if (!passenger.age) {
                newErrors.passengers[index].age = "Passenger age is required.";
                valid = false;
            } else if (
                !Number.isInteger(Number(passenger.age)) ||
                Number(passenger.age) < 1 ||
                Number(passenger.age) > 120
            ) {
                newErrors.passengers[index].age =
                    "Age must be a whole number between 1 and 120.";
                valid = false;
            }
            if (!passenger.gender) {
                newErrors.passengers[index].gender = "Select gender.";
                valid = false;
            }
            if (
                passenger.seniorCitizen &&
                Number(passenger.age) < 60
            ) {
                newErrors.passengers[index].age =
                    "Senior Citizen can be selected only for age 60 or above.";
                valid = false;
            }
        });

        if (
            !boardingStation ||
            !droppingStation ||
            !selectedClass ||
            distance <= 0 ||
            farePerPassenger <= 0
        ) {
            setSubmitError(
                "This route or class is no longer valid. Please select the train again."
            );
            valid = false;
        }

        setErrors(newErrors);
        return valid;
    };

    /* ── Submit booking → backend → redirect to seat selection ── */
    const continueBooking = async () => {
        setSubmitError("");

        if (!userId) {
            setSubmitError("Please log in again before continuing your booking.");
            return;
        }

        if (!validateForm()) return;

        setSubmitting(true);
        try {
            const payload = {
                userId,
                trainId,
                trainNo,
                bookingType,
                fromStation: fromCode,
                toStation: toCode,
                journeyDate,
                classCode,
                farePerPassenger,
                totalFare,
                contact: {
                    mobile: contact.mobile.trim(),
                    email: contact.email.trim().toLowerCase()
                },
                passengers: passengers.map((passenger) => ({
                    ...passenger,
                    name: passenger.name.trim(),
                    age: Number(passenger.age)
                }))
            };

            const res = await withMinimumDuration(
                axios.post(`${API_BASE_URL}/bookings`, payload)
            );

            const { bookingToken } = res.data;

            // Redirect to seat-selection with the token in the URL
            if (bookingType === "CONFIRMED") {
                navigate(`/seat-selection?token=${bookingToken}`);
            } else {
                navigate(`/review?token=${bookingToken}`);
            }

        } catch (err) {
            setSubmitError(
                err.response?.data?.message ||
                "Something went wrong while saving your booking. Please try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    /* ── Loading state ─────────────────────────────────────── */
    if (loading) {
        return (
            <>
                <Navbar />
                <JourneyLoader
                    mode="page"
                    title="Preparing passenger details"
                    subtitle="Loading your selected train, route, class, and fare information."
                />
                <Footer />
            </>
        );
    }

    if (pageError || !train) {
        return (
            <>
                <Navbar />
                <main className="pd-page">
                    <div className="pd-page-error">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <h2>Journey unavailable</h2>
                        <p>{pageError || "The selected train could not be found."}</p>
                        <button type="button" onClick={() => navigate("/")}>
                            Search Again
                        </button>
                    </div>
                </main>
                <Footer />
            </>
        );
    }

    /* ── Render ────────────────────────────────────────────── */
    return (
        <>
            <Navbar />

            <div className="pd-page">

                <div className="container">

                    {submitError && (
                        <div className="pd-form-alert" role="alert">
                            <i className="fa-solid fa-circle-exclamation"></i>
                            {submitError}
                        </div>
                    )}

                    {/* ── Booking Progress ── */}
                    <div className="pd-booking-progress">

                        <div className="pd-progress-step completed">
                            <div className="pd-step-icon">
                                <i className="fa-solid fa-magnifying-glass"></i>
                            </div>
                            <div className="pd-step-content">
                                <h6>Search Train</h6>
                                <span>Completed</span>
                            </div>
                        </div>

                        <div className="pd-progress-line active"></div>

                        <div className="pd-progress-step active">
                            <div className="pd-step-icon">
                                <i className="fa-solid fa-users"></i>
                            </div>
                            <div className="pd-step-content">
                                <h6>Passengers</h6>
                                <span>Current Step</span>
                            </div>
                        </div>

                        <div className="pd-progress-line"></div>

                        <div className={`pd-progress-step ${bookingType !== "CONFIRMED" ? "skipped" : ""}`}>
                            <div className="pd-step-icon">
                                <i className="fa-solid fa-couch"></i>
                            </div>
                            <div className="pd-step-content">
                                <h6>Seat Selection</h6>
                                <span>
                                    {bookingType !== "CONFIRMED"
                                        ? "Skipped (No seats available)"
                                        : "Pending"}
                                </span>
                            </div>
                        </div>

                        <div className="pd-progress-line"></div>

                        <div className="pd-progress-step">
                            <div className="pd-step-icon">
                                <i className="fa-solid fa-clipboard-check"></i>
                            </div>
                            <div className="pd-step-content">
                                <h6>Review</h6>
                                <span>Pending</span>
                            </div>
                        </div>

                        <div className="pd-progress-line"></div>

                        <div className="pd-progress-step">
                            <div className="pd-step-icon">
                                <i className="fa-solid fa-credit-card"></i>
                            </div>
                            <div className="pd-step-content">
                                <h6>Payment</h6>
                                <span>Pending</span>
                            </div>
                        </div>

                    </div>

                    <div className="row">

                        {/* ── LEFT: Journey Summary Card ── */}
                        <div className="col-lg-4">
                            <div className="pd-journey-card">

                                <div className="pd-journey-top">
                                    <span className="pd-train-no">#{trainNo}</span>
                                    <h4>{train?.name}</h4>
                                </div>

                                <div className="pd-route-section">
                                    <div>
                                        <strong>{boardingStation?.stationCode}</strong>
                                        <p>{boardingStation?.stationName}</p>
                                        <span>{boardingStation?.departureTime}</span>
                                    </div>

                                    <i className="fa-solid fa-arrow-right-long"></i>

                                    <div>
                                        <strong>{droppingStation?.stationCode}</strong>
                                        <p>{droppingStation?.stationName}</p>
                                        <span>{droppingStation?.arrivalTime}</span>
                                    </div>
                                </div>

                                <div className="pd-journey-info">

                                    <div className="pd-journey-info-item">
                                        <div className="pd-info-badge">
                                            <i className="fa-solid fa-calendar-days"></i>
                                        </div>
                                        <div>
                                            <span>Date</span>
                                            <strong>{journeyDate}</strong>
                                        </div>
                                    </div>

                                    <div className="pd-journey-info-item">
                                        <div className="pd-info-badge">
                                            <i className="fa-solid fa-chair"></i>
                                        </div>
                                        <div>
                                            <span>Class</span>
                                            <strong>{selectedClass?.name || classCode}</strong>
                                        </div>
                                    </div>

                                    <div className="pd-journey-info-item">
                                        <div className="pd-info-badge">
                                            <i className="fa-solid fa-road"></i>
                                        </div>
                                        <div>
                                            <span>Distance</span>
                                            <strong>{distance} km</strong>
                                        </div>
                                    </div>

                                </div>

                                <div className="pd-fare-box">
                                    <small>Total Fare ({passengers.length} passenger{passengers.length > 1 ? "s" : ""})</small>
                                    <h2>₹{totalFare}</h2>
                                </div>

                            </div>
                        </div>

                        {/* ── RIGHT: Forms ── */}
                        <div className="col-lg-8">

                            {/* Contact Information */}
                            <div className="pd-form-card">

                                <h4 className="pd-section-title">Contact Information</h4>

                                <div className="pd-row">

                                    {/* Mobile */}
                                    <div className="pd-input-group">
                                        <label className="pd-input-label">
                                            <i className="fa-solid fa-phone"></i>
                                            Mobile Number
                                        </label>
                                        <div className="pd-input-wrapper">
                                            <div className="pd-input-icon">
                                                <i className="fa-solid fa-phone"></i>
                                            </div>
                                            <input
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength={10}
                                                className={`pd-custom-input ${errors.contact.mobile ? "pd-input-error" : ""}`}
                                                placeholder="Enter Mobile Number"
                                                value={contact.mobile}
                                                onChange={(e) => {
                                                    setContact({
                                                        ...contact,
                                                        mobile: e.target.value
                                                            .replace(/\D/g, "")
                                                            .slice(0, 10)
                                                    });
                                                    clearContactError("mobile");
                                                }}
                                            />
                                        </div>
                                        {errors.contact.mobile && (
                                            <span className="pd-input-error-message">
                                                {errors.contact.mobile}
                                            </span>
                                        )}
                                    </div>

                                    {/* Email */}
                                    <div className="pd-input-group">
                                        <label className="pd-input-label">
                                            <i className="fa-solid fa-envelope"></i>
                                            Email Address
                                        </label>
                                        <div className="pd-input-wrapper">
                                            <div className="pd-input-icon">
                                                <i className="fa-solid fa-envelope"></i>
                                            </div>
                                            <input
                                                type="email"
                                                maxLength={254}
                                                className={`pd-custom-input ${errors.contact.email ? "pd-input-error" : ""}`}
                                                placeholder="Enter Email Address"
                                                value={contact.email}
                                                onChange={(e) => {
                                                    setContact({ ...contact, email: e.target.value });
                                                    clearContactError("email");
                                                }}
                                            />
                                        </div>
                                        {errors.contact.email && (
                                            <span className="pd-input-error-message">
                                                {errors.contact.email}
                                            </span>
                                        )}
                                    </div>

                                </div>
                            </div>

                            {/* Passenger Details */}
                            <div className="pd-form-card">

                                <div className="pd-section-header">
                                    <h4>Passenger Details</h4>
                                    <button
                                        className="pd-btn pd-btn-add-passenger"
                                        type="button"
                                        onClick={addPassenger}
                                    >
                                        <i className="fa-solid fa-user-plus"></i>
                                        Add Passenger
                                    </button>
                                </div>

                                {savedPassengers.length > 0 && (
                                    <div className="pd-saved-passengers">
                                        <div className="pd-saved-passengers-title">
                                            <i className="fa-solid fa-address-book"></i>
                                            <span>Saved Passengers</span>
                                        </div>
                                        <div className="pd-saved-passenger-list">
                                            {savedPassengers.map((savedPassenger) => (
                                                <button
                                                    type="button"
                                                    className="pd-saved-passenger-chip"
                                                    key={savedPassenger.id}
                                                    onClick={() => applySavedPassenger(savedPassenger)}
                                                >
                                                    <span>{savedPassenger.name}</span>
                                                    <small>
                                                        {savedPassenger.age} yrs - {savedPassenger.gender}
                                                    </small>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {passengers.map((passenger, index) => (
                                    <div key={index} className="pd-passenger-card">

                                        <div className="pd-passenger-top">
                                            <h5>Passenger {index + 1}</h5>
                                            {index > 0 && (
                                                <button
                                                    type="button"
                                                    className="pd-btn-remove"
                                                    onClick={() => removePassenger(index)}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>

                                        <div className="pd-row">

                                            {/* Name */}
                                            <div className="pd-input-group">
                                                <label className="pd-input-label">
                                                    <i className="fa-solid fa-user"></i>
                                                    Full Name
                                                </label>
                                                <div className="pd-input-wrapper">
                                                    <div className="pd-input-icon">
                                                        <i className="fa-solid fa-user"></i>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        maxLength={60}
                                                        className={`pd-custom-input ${errors.passengers[index]?.name ? "pd-input-error" : ""}`}
                                                        placeholder="Passenger Name"
                                                        value={passenger.name}
                                                        onChange={(e) =>
                                                            updatePassenger(index, "name", e.target.value)
                                                        }
                                                    />
                                                </div>
                                                {errors.passengers[index]?.name && (
                                                    <span className="pd-input-error-message">
                                                        {errors.passengers[index].name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Age */}
                                            <div className="pd-input-group">
                                                <label className="pd-input-label">
                                                    <i className="fa-solid fa-cake-candles"></i>
                                                    Age
                                                </label>
                                                <div className="pd-input-wrapper">
                                                    <div className="pd-input-icon">
                                                        <i className="fa-solid fa-cake-candles"></i>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="120"
                                                        step="1"
                                                        inputMode="numeric"
                                                        className={`pd-custom-input ${errors.passengers[index]?.age ? "pd-input-error" : ""}`}
                                                        placeholder="Age"
                                                        value={passenger.age}
                                                        onChange={(e) => {
                                                            const value = e.target.value
                                                                .replace(/\D/g, "")
                                                                .slice(0, 3);
                                                            updatePassenger(index, "age", value);
                                                        }}
                                                    />
                                                </div>
                                                {errors.passengers[index]?.age && (
                                                    <span className="pd-input-error-message">
                                                        {errors.passengers[index].age}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Gender */}
                                            <div className="pd-input-group">
                                                <label className="pd-input-label">
                                                    <i className="fa-solid fa-venus-mars"></i>
                                                    Gender
                                                </label>
                                                <div className="pd-select-wrapper">
                                                    <div className="pd-select-icon">
                                                        <i className="fa-solid fa-venus-mars"></i>
                                                    </div>
                                                    <select
                                                        className={`pd-premium-select ${errors.passengers[index]?.gender ? "pd-input-error" : ""}`}
                                                        value={passenger.gender}
                                                        onChange={(e) =>
                                                            updatePassenger(index, "gender", e.target.value)
                                                        }
                                                    >
                                                        <option value="">Select Gender</option>
                                                        <option value="Male">Male</option>
                                                        <option value="Female">Female</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                    <div className="pd-select-arrow">
                                                        <i className="fa-solid fa-chevron-down"></i>
                                                    </div>
                                                </div>
                                                {errors.passengers[index]?.gender && (
                                                    <span className="pd-input-error-message">
                                                        {errors.passengers[index].gender}
                                                    </span>
                                                )}
                                            </div>

                                        </div>

                                        {/* Senior Citizen */}
                                        <div className="pd-form-check">
                                            <input
                                                className="pd-form-check-input"
                                                type="checkbox"
                                                id={`senior-${index}`}
                                                checked={passenger.seniorCitizen}
                                                onChange={(e) =>
                                                    updatePassenger(index, "seniorCitizen", e.target.checked)
                                                }
                                            />
                                            <label
                                                className="pd-form-check-label"
                                                htmlFor={`senior-${index}`}
                                            >
                                                Senior Citizen
                                            </label>
                                        </div>

                                    </div>
                                ))}

                                {/* Totals */}
                                <div className="pd-passenger-summary">
                                    <div>
                                        <span>Total Passengers</span>
                                        <strong>{passengers.length}</strong>
                                    </div>
                                    <div>
                                        <span>Total Amount</span>
                                        <strong>₹{totalFare}</strong>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="pd-footer-actions">

                                    <button
                                        type="button"
                                        className="pd-back-btn"
                                        onClick={() => navigate(-1)}
                                    >
                                        <i className="fa-solid fa-arrow-left-long"></i>
                                        <span>Back</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="pd-continue-btn"
                                        onClick={continueBooking}
                                        disabled={submitting}
                                    >
                                        <span>
                                            {submitting ? "Saving..." : bookingType === "CONFIRMED" ? "Continue to Seat Selection" : "Continue to Review"}
                                        </span>
                                        {!submitting && (
                                            <div className="pd-btn-arrow">
                                                <i className="fa-solid fa-arrow-right-long"></i>
                                            </div>
                                        )}
                                    </button>

                                </div>

                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <Footer />

            {submitting && (
                <JourneyLoader
                    mode="overlay"
                    title="Saving passenger details"
                    subtitle="Creating a secure booking session before seat selection."
                />
            )}
        </>
    );
}

export default PassengerDetails;
