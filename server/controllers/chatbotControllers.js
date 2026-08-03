const mongoose = require("mongoose");

// Adjust these two paths to match your project structure if different.
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

const { detectIntent, extractEntities } = require("../utils/chatbotNLU");

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 300;

const DATA_INTENTS = ["pnr_status", "booking_status", "payment_status", "cancel_booking"];

// Static replies for intents that don't need a DB lookup at all.
const staticCatalog = {
    greeting:
        "Hi! I can check your PNR, booking, and payment status directly from your account, or help with train search, seats, cancellations, and login issues. What would you like to do?",
    booking_help:
        "To book a ticket, search from the home page by station or train number, choose your date and class, select a train, add passenger details, pick seats, review the journey, and complete payment.",
    train_search:
        "Use Train No / Name search on the home page when you already know the train. You can also search by stations to compare trains for a route and journey date.",
    seat_availability:
        "Seat and coach availability appears after you search trains and continue through the booking flow. Select your preferred class first so RailGo can show matching availability.",
    account_help:
        "For account help, use the Login menu on the navbar. After signing in, open Profile to review your details or My Bookings to manage tickets linked to your account.",
    fallback:
        "I can help with booking tickets, train search, PNR status, payments, cancellations, seats, and account questions. Please share what you are trying to do, and I will guide you step by step."
};

const requiresLoginReply =
    "Please log in first — I can pull real PNR, booking, and payment details from your account once you're signed in. You can also use the PNR Status page in the navbar to check a ticket without logging in.";

// ---------- formatting helpers ----------

const formatPassengerLine = (passenger) => {
    const seat = passenger.seatNumber ? `seat ${passenger.seatNumber}` : "seat not yet allotted";
    const cancelledTag = passenger.status === "CANCELLED" ? ", cancelled" : "";
    return `${passenger.name} (${passenger.reservationStatus}, ${seat}${cancelledTag})`;
};

const formatBookingSummary = (booking) => {
    const passengerLines = booking.passengers.map(formatPassengerLine).join("; ");

    const lines = [
        `Train ${booking.trainNo}, ${booking.fromStation} to ${booking.toStation} on ${booking.journeyDate}, class ${booking.classCode}.`,
        `Booking status: ${booking.bookingStatus}, reservation: ${booking.reservationStatus}${booking.bookingType !== "CONFIRMED" ? ` (${booking.bookingType})` : ""
        }.`,
        `Passengers: ${passengerLines}.`,
        `Payment status: ${booking.paymentStatus}. Total fare: Rs. ${booking.totalFare}.`
    ];

    if (booking.pnrNumber) {
        lines.unshift(`PNR: ${booking.pnrNumber}.`);
    }

    if (booking.cancellationStatus !== "ACTIVE") {
        lines.push(`Cancellation: ${booking.cancellationStatus}.`);
    }

    return lines.join(" ");
};

// ---------- DB lookup helpers ----------

/**
 * Resolve a single booking for this user from whatever entity we have
 * (PNR > booking token > object id). If none of those were extracted from
 * the message, falls back to the user's most recent booking — this is what
 * makes "what's my booking status" work without the user typing an id.
 */
const findBookingForUser = async ({ userId, pnrNumber, bookingToken, objectId }) => {
    if (!userId) return null;

    if (pnrNumber) {
        return Booking.findOne({ userId, pnrNumber });
    }

    if (bookingToken) {
        return Booking.findOne({ userId, bookingToken: new RegExp(`^${bookingToken}$`, "i") });
    }

    if (objectId && mongoose.Types.ObjectId.isValid(objectId)) {
        return Booking.findOne({ userId, _id: objectId });
    }

    return Booking.findOne({ userId }).sort({ createdAt: -1 });
};

// ---------- intent handlers ----------
// Each handler returns { reply, booking } so the caller can build follow-up
// context (e.g. "cancel it" referring to the booking just looked up)
// without re-querying the database a second time.

const handlePnrStatus = async ({ userId, entities }) => {
    if (!userId) return { reply: requiresLoginReply, booking: null };

    if (!entities.pnrNumber) {
        return {
            reply: "Please share your 10-digit PNR number and I will look up the journey, passenger, and status details.",
            booking: null
        };
    }

    const booking = await Booking.findOne({ userId, pnrNumber: entities.pnrNumber });

    if (!booking) {
        return {
            reply: `I couldn't find a booking with PNR ${entities.pnrNumber} on your account. Please double-check the number, or use PNR Status in the navbar.`,
            booking: null
        };
    }

    return { reply: formatBookingSummary(booking), booking };
};

const handleBookingStatus = async ({ userId, entities }) => {
    if (!userId) return { reply: requiresLoginReply, booking: null };

    const booking = await findBookingForUser({ userId, ...entities });

    if (!booking) {
        return {
            reply: "I couldn't find that booking on your account yet. If you just paid, this can take a minute to update.",
            booking: null
        };
    }

    return { reply: formatBookingSummary(booking), booking };
};

const handlePaymentStatus = async ({ userId, entities }) => {
    if (!userId) return { reply: requiresLoginReply, booking: null };

    const booking = await findBookingForUser({ userId, ...entities });

    if (!booking) {
        return {
            reply: "I couldn't find a matching booking to check payment for. Please share the PNR or booking reference.",
            booking: null
        };
    }

    const payment = await Payment.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });

    if (!payment) {
        return {
            reply: `This booking's payment status is "${booking.paymentStatus}". No payment attempt record was found yet.`,
            booking
        };
    }

    const parts = [`Payment status: ${payment.status}, amount Rs. ${payment.amount} via ${payment.paymentMethod}.`];

    if (payment.status === "FAILED" && payment.failureReason) {
        parts.push(`Reason: ${payment.failureReason}. You can retry payment from the booking flow.`);
    }
    if (payment.status === "SUCCESS" && payment.paidAt) {
        parts.push(`Paid on ${new Date(payment.paidAt).toLocaleString("en-IN")}.`);
    }
    if (payment.status === "REFUNDED" && payment.refundedAt) {
        parts.push(`Refunded on ${new Date(payment.refundedAt).toLocaleString("en-IN")}.`);
    }

    return { reply: parts.join(" "), booking };
};

const handleCancelBooking = async ({ userId, entities, context }) => {
    if (!userId) return { reply: requiresLoginReply, booking: null };

    const hasExplicitEntity = entities.pnrNumber || entities.bookingToken || entities.objectId;

    // "cancel it" right after a PNR/booking lookup: resolve the pronoun using
    // the context the frontend sent back from the previous response.
    const lookupEntities = hasExplicitEntity
        ? entities
        : {
            pnrNumber: context?.lastPnr || null,
            bookingToken: context?.lastBookingToken || null,
            objectId: context?.lastBookingId || null
        };

    const booking = await findBookingForUser({ userId, ...lookupEntities });

    if (!booking) {
        return {
            reply:
                "Please share the PNR, or open My Bookings, select the ticket, and use the Cancel option there. I can confirm the cancellation status right after.",
            booking: null
        };
    }

    if (booking.cancellationStatus === "FULLY_CANCELLED") {
        return {
            reply: `This booking (PNR ${booking.pnrNumber || "not yet generated"}) is already fully cancelled.`,
            booking
        };
    }

    return {
        reply: `Found it — train ${booking.trainNo} on ${booking.journeyDate}, current status: ${booking.cancellationStatus}. For safety, I can't cancel it directly from chat; open My Bookings and select Cancel on this ticket, and I can confirm the update once it's done.`,
        booking
    };
};

// ---------- follow-up context ----------

const buildContext = (booking) => {
    if (!booking) return {};

    return {
        lastBookingId: String(booking._id),
        lastPnr: booking.pnrNumber || null,
        lastBookingToken: booking.bookingToken || null
    };
};

// ---------- route handlers ----------

exports.sendMessage = async (req, res) => {
    try {
        const message = String(req.body?.message || "").trim();
        const context = req.body?.context && typeof req.body.context === "object" ? req.body.context : {};

        if (message.length < MIN_MESSAGE_LENGTH) {
            return res.status(400).json({ message: "Please enter a message for the assistant." });
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                message: `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`
            });
        }

        const userId = req.user?.id || null;
        const intent = detectIntent(message);
        const entities = extractEntities(message);

        let reply;
        let booking = null;

        if (DATA_INTENTS.includes(intent)) {
            let result;

            switch (intent) {
                case "pnr_status":
                    result = await handlePnrStatus({ userId, entities });
                    break;
                case "booking_status":
                    result = await handleBookingStatus({ userId, entities });
                    break;
                case "payment_status":
                    result = await handlePaymentStatus({ userId, entities });
                    break;
                case "cancel_booking":
                    result = await handleCancelBooking({ userId, entities, context });
                    break;
                default:
                    result = { reply: staticCatalog.fallback, booking: null };
            }

            reply = result.reply;
            booking = result.booking;
        } else {
            reply = staticCatalog[intent] || staticCatalog.fallback;
        }

        return res.status(200).json({
            reply,
            intent,
            mode: "live",
            source: "railgo-chatbot",
            context: buildContext(booking),
            suggestions: [
                "Check my PNR status",
                "Latest booking status",
                "Payment failed",
                "Cancel booking"
            ]
        });
    } catch (error) {
        console.error("Chatbot error:", error);

        return res.status(500).json({
            reply: "Something went wrong while checking that. Please try again in a moment, or use My Bookings / PNR Status directly.",
            mode: "error"
        });
    }
};

exports.healthCheck = (req, res) => {
    return res.status(200).json({ status: "ok", service: "railgo-chatbot", mode: "live" });
};