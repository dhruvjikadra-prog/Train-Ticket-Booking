const mongoose = require("mongoose");

const BOOKING_STATUSES = [
    "pending",
    "seat_selected",
    "review_completed",
    "payment_processing",
    "payment_success",
    "completed",
    "expired"
];

const RESERVATION_STATUSES = [
    "CNF",
    "RAC",
    "WL",
    "CAN",
    "CHART_PREPARED",
    // Booking-level only (never set on an individual passenger): some
    // passengers in this CONFIRMED booking got a seat (CNF) while the
    // remaining passenger(s) are WL because fewer seats were available
    // than passengers at seat-selection time.
    "PARTIAL"
];

// Determined at booking-creation time based on live seat availability.
// CONFIRMED -> normal flow (Passenger Details -> Seat Selection -> Review -> Payment)
// RAC / WL   -> seats are not available -> Seat Selection is skipped
//              (Passenger Details -> Review -> Payment); seat number is
//              allotted later (e.g. at chart preparation).
const BOOKING_TYPES = ["CONFIRMED", "RAC", "WL"];

const PAYMENT_STATUSES = [
    "pending",
    "processing",
    "paid",
    "failed",
    "refunded"
];

const CANCELLATION_STATUSES = [
    "ACTIVE",
    "PARTIAL_CANCELLED",
    "FULLY_CANCELLED"
];

const PassengerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        age: { type: Number, required: true, min: 1 },
        gender: { type: String, required: true, enum: ["Male", "Female", "Other"] },
        seniorCitizen: { type: Boolean, default: false },
        seatNumber: { type: String, default: null },
        cancelledSeatNumber: { type: String, default: null },
        reservationStatus: {
            type: String,
            enum: RESERVATION_STATUSES,
            default: "CNF"
        },
        status: {
            type: String,
            enum: ["ACTIVE", "CANCELLED"],
            default: "ACTIVE"
        },
        cancelledAt: { type: Date, default: null },
        cancellationReason: { type: String, trim: true, default: null }
    },
    { _id: true }
);

const ContactSchema = new mongoose.Schema(
    {
        mobile: { type: String, required: true, match: /^\d{10}$/ },
        email: {
            type: String,
            required: true,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            lowercase: true,
            trim: true
        }
    },
    { _id: false }
);

const CancellationHistorySchema = new mongoose.Schema(
    {
        passengerId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        passengerIndex: { type: Number, default: null },
        passengerName: { type: String, trim: true, default: null },
        seatNumber: { type: String, trim: true, default: null },
        reason: { type: String, trim: true, default: null },
        cancelledAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const BookingSchema = new mongoose.Schema(
    {
        bookingToken: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true
        },
        trainNo: { type: String, required: true },
        fromStation: { type: String, required: true, uppercase: true, trim: true },
        toStation: { type: String, required: true, uppercase: true, trim: true },
        journeyDate: { type: String, required: true },
        classCode: { type: String, required: true },

        // CONFIRMED = normal flow with seat selection.
        // RAC/WL = seats were unavailable at booking time, so seat
        // selection is skipped and the booking goes straight to review.
        bookingType: {
            type: String,
            enum: BOOKING_TYPES,
            default: "CONFIRMED",
            index: true
        },

        farePerPassenger: { type: Number, required: true },
        totalFare: { type: Number, required: true },

        contact: { type: ContactSchema, required: true },
        passengers: { type: [PassengerSchema], required: true },

        bookingStatus: {
            type: String,
            enum: BOOKING_STATUSES,
            default: "pending",
            index: true
        },
        reservationStatus: {
            type: String,
            enum: RESERVATION_STATUSES,
            default: "CNF",
            index: true
        },
        paymentStatus: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: "pending"
        },
        cancellationStatus: {
            type: String,
            enum: CANCELLATION_STATUSES,
            default: "ACTIVE",
            index: true
        },

        // Deprecated compatibility field for older code paths.
        status: {
            type: String,
            enum: [
                "pending",
                "seats_selected",
                "seat_selected",
                "review_completed",
                "payment_processing",
                "payment_success",
                "confirmed",
                "completed",
                "cancelled",
                "partial_cancelled",
                "expired"
            ],
            default: "pending"
        },

        selectedSeats: { type: [String], default: [] },

        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payment",
            default: null
        },
        paymentProcessingStartedAt: { type: Date, default: null },
        paidAt: { type: Date, default: null },
        pnrNumber: {
            type: String,
            default: undefined
        },
        ticketGeneratedAt: { type: Date, default: null },

        cancelledAt: { type: Date, default: null },
        cancellationReason: { type: String, trim: true, default: null },
        cancellationHistory: {
            type: [CancellationHistorySchema],
            default: []
        },

        // App code expires sessions and releases seats without deleting bookings.
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 60 * 1000),
            index: true
        }
    },
    {
        timestamps: true
    }
);

const BookingModel = mongoose.model("Booking", BookingSchema);

BookingModel.BOOKING_TYPES = BOOKING_TYPES;
BookingModel.BOOKING_STATUSES = BOOKING_STATUSES;
BookingModel.RESERVATION_STATUSES = RESERVATION_STATUSES;

module.exports = BookingModel;