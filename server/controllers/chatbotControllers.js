const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

const { detectIntent, extractEntities } = require("../utils/chatbotNLU");

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 300;

const DATA_INTENTS = ["pnr_status", "booking_status", "payment_status", "cancel_booking"];

const BOOKING_POPULATE = {
    path: "trainId",
    select: "name trainName trainNumber route departureTime arrivalTime source destination"
};

const defaultSuggestions = [
    "Find my latest booking",
    "Check my PNR status",
    "Payment status",
    "Cancel booking"
];

const staticCatalog = {
    greeting:
        "Hi! I can find your latest booking, PNR status, and payment status when you are signed in. You can also ask about train search, seats, cancellations, and account help.",
    booking_help:
        "To book a ticket, search from the home page by station or train number, choose your date and class, select a train, add passenger details, pick seats, review the journey, and complete payment.",
    train_search:
        "Use Train No / Name search on the home page when you already know the train. You can also search by stations to compare trains for a route and journey date.",
    seat_availability:
        "Seat and coach availability appears after you search trains and continue through the booking flow. Select your preferred class first so RailGo can show matching availability.",
    account_help:
        "Use the Login menu on the navbar to sign in. After signing in, Profile shows your account details and My Bookings shows tickets linked to your account.",
    fallback:
        "I can help with booking tickets, train search, PNR status, payments, cancellations, seats, and account questions. Try asking: Find my latest booking, Check PNR 1234567890, or Payment status."
};

const requiresLoginReply =
    "Please log in first. I can only show booking, PNR, and payment details after I can verify the account owner. If you only have a PNR, the PNR Status page can check it after captcha verification.";

const escapeRegExp = (value) =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePnr = (value) => String(value || "").replace(/\D/g, "");

const humanize = (value, fallback = "Pending") => {
    const text = String(value || fallback).replace(/_/g, " ").trim();
    if (!text) return fallback;

    return text
        .toLowerCase()
        .replace(/\b[a-z]/g, (match) => match.toUpperCase());
};

const formatDate = (value) => {
    if (!value) return "-";

    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return String(value);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

const formatDateTime = (value) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

const formatMoney = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Rs. 0";

    return `Rs. ${amount.toLocaleString("en-IN")}`;
};

const getLifecycleStatus = (booking) => {
    if (booking.bookingStatus) return booking.bookingStatus;
    if (booking.status === "confirmed") return "completed";
    if (booking.status === "seats_selected") return "seat_selected";
    return booking.status || "pending";
};

const getDisplayStatus = (booking) => {
    if (
        booking.cancellationStatus === "FULLY_CANCELLED" ||
        booking.status === "cancelled"
    ) {
        return "Cancelled";
    }

    if (booking.cancellationStatus === "PARTIAL_CANCELLED") {
        return "Partially Cancelled";
    }

    return humanize(booking.reservationStatus || getLifecycleStatus(booking));
};

const getTrainName = (booking) => {
    const train = booking.trainId || {};
    return train.trainName || train.name || "";
};

const getTrainNumber = (booking) => {
    const train = booking.trainId || {};
    return booking.trainNo || train.trainNumber || "-";
};

const getSeatLabel = (passenger) => {
    if (passenger.status === "CANCELLED" || passenger.reservationStatus === "CAN") {
        return passenger.cancelledSeatNumber
            ? `cancelled seat ${passenger.cancelledSeatNumber}`
            : "cancelled";
    }

    return passenger.seatNumber
        ? `seat ${passenger.seatNumber}`
        : "seat not allotted";
};

const formatPassengerLine = (passenger, index) => {
    const name = passenger.name || `Passenger ${index + 1}`;
    const status = humanize(passenger.reservationStatus || passenger.status);
    return `${name}: ${status}, ${getSeatLabel(passenger)}`;
};

const getActivePassengerCount = (booking) => {
    if (!Array.isArray(booking.passengers)) return 0;

    return booking.passengers.filter(
        (passenger) =>
            passenger.status !== "CANCELLED" &&
            passenger.reservationStatus !== "CAN"
    ).length;
};

const populateBooking = (query) => query.populate(BOOKING_POPULATE).lean();

const findLatestPaymentForBooking = (booking) => {
    if (!booking?._id && !booking?.bookingToken) return null;

    return Payment.findOne({
        $or: [
            booking._id ? { bookingId: booking._id } : null,
            booking.bookingToken ? { bookingToken: booking.bookingToken } : null
        ].filter(Boolean)
    })
        .sort({ createdAt: -1 })
        .lean();
};

const findLatestBookingForUser = ({ userId, withPnrOnly = false }) => {
    const filter = { userId };

    if (withPnrOnly) {
        filter.pnrNumber = { $exists: true, $nin: [null, ""] };
    }

    return populateBooking(
        Booking.findOne(filter).sort({ createdAt: -1 })
    );
};

const findBookingForUser = async ({ userId, pnrNumber, bookingToken, objectId }) => {
    if (!userId) return null;

    const normalizedPnr = normalizePnr(pnrNumber);

    if (normalizedPnr) {
        return populateBooking(Booking.findOne({ userId, pnrNumber: normalizedPnr }));
    }

    if (bookingToken) {
        return populateBooking(
            Booking.findOne({
                userId,
                bookingToken: new RegExp(`^${escapeRegExp(bookingToken)}$`, "i")
            })
        );
    }

    if (objectId && mongoose.Types.ObjectId.isValid(objectId)) {
        return populateBooking(Booking.findOne({ userId, _id: objectId }));
    }

    return findLatestBookingForUser({ userId });
};

const findPaymentByTransactionForUser = async ({ userId, transactionId }) => {
    if (!userId || !transactionId) return { booking: null, payment: null };

    const payment = await Payment.findOne({
        transactionId: new RegExp(`^${escapeRegExp(transactionId)}$`, "i")
    })
        .sort({ createdAt: -1 })
        .lean();

    if (!payment) return { booking: null, payment: null };

    const booking = await populateBooking(
        Booking.findOne({ userId, _id: payment.bookingId })
    );

    if (!booking) return { booking: null, payment: null };

    return { booking, payment };
};

const toChatBooking = (booking) => {
    if (!booking) return null;

    return {
        id: booking._id?.toString(),
        bookingToken: booking.bookingToken,
        pnrNumber: booking.pnrNumber || null,
        status: {
            display: getDisplayStatus(booking),
            booking: humanize(getLifecycleStatus(booking)),
            reservation: booking.reservationStatus || null,
            payment: humanize(booking.paymentStatus),
            cancellation: humanize(booking.cancellationStatus || "ACTIVE")
        },
        train: {
            number: getTrainNumber(booking),
            name: getTrainName(booking) || null
        },
        journey: {
            fromStation: booking.fromStation,
            toStation: booking.toStation,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        },
        fare: {
            amount: booking.totalFare,
            currency: "INR"
        },
        passengers: Array.isArray(booking.passengers)
            ? booking.passengers.map((passenger, index) => ({
                number: index + 1,
                name: passenger.name,
                seatNumber: passenger.seatNumber || null,
                cancelledSeatNumber: passenger.cancelledSeatNumber || null,
                reservationStatus: passenger.reservationStatus || null,
                status: passenger.status || null
            }))
            : [],
        timeline: {
            bookedAt: booking.createdAt || null,
            paidAt: booking.paidAt || null,
            ticketGeneratedAt: booking.ticketGeneratedAt || null,
            cancelledAt: booking.cancelledAt || null
        }
    };
};

const toChatPayment = (payment) => {
    if (!payment) return null;

    return {
        id: payment._id?.toString(),
        transactionId: payment.transactionId,
        bookingToken: payment.bookingToken,
        status: payment.status,
        method: payment.paymentMethod,
        amount: payment.amount,
        currency: payment.currency || "INR",
        failureReason: payment.failureReason || null,
        paidAt: payment.paidAt || null,
        failedAt: payment.failedAt || null,
        refundedAt: payment.refundedAt || null,
        createdAt: payment.createdAt || null
    };
};

const buildBookingReply = (booking, { heading = "I found your booking.", payment = null } = {}) => {
    const trainName = getTrainName(booking);
    const passengerCount = Array.isArray(booking.passengers) ? booking.passengers.length : 0;
    const activePassengerCount = getActivePassengerCount(booking);
    const passengerLines = Array.isArray(booking.passengers)
        ? booking.passengers.slice(0, 4).map(formatPassengerLine)
        : [];

    if (passengerCount > passengerLines.length) {
        passengerLines.push(`${passengerCount - passengerLines.length} more passenger(s) in this booking`);
    }

    const lines = [
        heading,
        `PNR: ${booking.pnrNumber || "Not generated yet"}`,
        `Booking ref: ${booking.bookingToken}`,
        `Train: ${getTrainNumber(booking)}${trainName ? ` - ${trainName}` : ""}`,
        `Route: ${booking.fromStation} to ${booking.toStation} on ${formatDate(booking.journeyDate)}, class ${booking.classCode}`,
        `Status: ${getDisplayStatus(booking)} | Booking: ${humanize(getLifecycleStatus(booking))} | Payment: ${humanize(booking.paymentStatus)}`,
        `Passengers: ${activePassengerCount}/${passengerCount} active${passengerLines.length ? ` - ${passengerLines.join("; ")}` : ""}`,
        `Fare: ${formatMoney(booking.totalFare)}`
    ];

    if (!booking.pnrNumber && booking.paymentStatus !== "paid") {
        lines.push("PNR is generated after successful payment.");
    }

    if (booking.cancellationStatus && booking.cancellationStatus !== "ACTIVE") {
        lines.push(`Cancellation: ${humanize(booking.cancellationStatus)}`);
    }

    if (payment?.transactionId) {
        lines.push(`Latest transaction: ${payment.transactionId} (${humanize(payment.status)})`);
    }

    return lines.join("\n");
};

const buildPaymentReply = (booking, payment) => {
    if (!payment) {
        return [
            "I found the booking, but no payment transaction is recorded yet.",
            `Booking ref: ${booking.bookingToken}`,
            `PNR: ${booking.pnrNumber || "Not generated yet"}`,
            `Booking payment status: ${humanize(booking.paymentStatus)}`,
            `Fare: ${formatMoney(booking.totalFare)}`
        ].join("\n");
    }

    const lines = [
        "I found your payment details.",
        `Transaction: ${payment.transactionId}`,
        `Payment status: ${humanize(payment.status)} | Booking payment: ${humanize(booking.paymentStatus)}`,
        `Amount: ${formatMoney(payment.amount)} via ${payment.paymentMethod}`,
        `Booking ref: ${booking.bookingToken}`,
        `PNR: ${booking.pnrNumber || "Not generated yet"}`,
        `Journey: ${booking.fromStation} to ${booking.toStation} on ${formatDate(booking.journeyDate)}`
    ];

    const paidAt = formatDateTime(payment.paidAt);
    const failedAt = formatDateTime(payment.failedAt);
    const refundedAt = formatDateTime(payment.refundedAt);

    if (paidAt) lines.push(`Paid at: ${paidAt}`);
    if (failedAt) lines.push(`Failed at: ${failedAt}`);
    if (refundedAt) lines.push(`Refunded at: ${refundedAt}`);
    if (payment.status === "FAILED" && payment.failureReason) {
        lines.push(`Reason: ${payment.failureReason}`);
    }

    return lines.join("\n");
};

const buildContext = (booking, payment = null) => {
    if (!booking && !payment) return {};

    return {
        lastBookingId: booking?._id ? String(booking._id) : null,
        lastPnr: booking?.pnrNumber || null,
        lastBookingToken: booking?.bookingToken || payment?.bookingToken || null,
        lastTransactionId: payment?.transactionId || null
    };
};

const responsePayload = ({
    reply,
    intent,
    booking = null,
    payment = null,
    suggestions = defaultSuggestions,
    authenticated = false,
    authRequired = false
}) => ({
    reply,
    intent,
    mode: "live",
    source: "railgo-chatbot",
    authenticated,
    authRequired,
    context: buildContext(booking, payment),
    result: booking || payment
        ? {
            type: payment ? "payment" : "booking",
            booking: toChatBooking(booking),
            payment: toChatPayment(payment)
        }
        : null,
    suggestions
});

const getContextEntities = (context) => ({
    pnrNumber: context?.lastPnr || null,
    bookingToken: context?.lastBookingToken || null,
    objectId: context?.lastBookingId || null,
    transactionId: context?.lastTransactionId || null
});

const hasBookingEntity = (entities) =>
    Boolean(entities.pnrNumber || entities.bookingToken || entities.objectId);

const handlePnrStatus = async ({ userId, entities }) => {
    if (!userId) {
        return {
            reply: requiresLoginReply,
            authRequired: true,
            suggestions: ["Login", "Open PNR Status", "How do I book a ticket?"]
        };
    }

    const normalizedPnr = normalizePnr(entities.pnrNumber);

    if (entities.pnrNumber && !/^\d{10}$/.test(normalizedPnr)) {
        return {
            reply: "Please share a valid 10-digit PNR number.",
            suggestions: ["Check my PNR status", "Find my latest booking"]
        };
    }

    const booking = normalizedPnr
        ? await findBookingForUser({ userId, pnrNumber: normalizedPnr })
        : await findLatestBookingForUser({ userId, withPnrOnly: true });

    if (!booking) {
        const latestBooking = await findLatestBookingForUser({ userId });

        if (latestBooking) {
            const payment = await findLatestPaymentForBooking(latestBooking);
            return {
                reply: buildBookingReply(latestBooking, {
                    heading: normalizedPnr
                        ? `I could not find PNR ${normalizedPnr} on your account. Here is your latest booking instead.`
                        : "I could not find a generated PNR yet. Here is your latest booking.",
                    payment
                }),
                booking: latestBooking,
                payment,
                suggestions: ["Payment status", "Find my latest booking", "Open My Bookings"]
            };
        }

        return {
            reply: normalizedPnr
                ? `I could not find PNR ${normalizedPnr} on your account. Please double-check the number or use the PNR Status page.`
                : "I could not find any bookings with a generated PNR on your account yet.",
            suggestions: ["Find my latest booking", "How do I book a ticket?"]
        };
    }

    const payment = await findLatestPaymentForBooking(booking);

    return {
        reply: buildBookingReply(booking, { heading: "Here is your PNR status.", payment }),
        booking,
        payment,
        suggestions: ["Payment status", "Cancel booking", "Find my latest booking"]
    };
};

const shouldUseContextForBooking = (message) =>
    /\b(it|this|that|same booking|same ticket)\b/i.test(message || "");

const handleBookingStatus = async ({ userId, entities, context, message }) => {
    if (!userId) {
        return {
            reply: requiresLoginReply,
            authRequired: true,
            suggestions: ["Login", "How do I book a ticket?", "Open PNR Status"]
        };
    }

    const lookupEntities = hasBookingEntity(entities)
        ? entities
        : shouldUseContextForBooking(message)
            ? getContextEntities(context)
            : {};

    const booking = await findBookingForUser({ userId, ...lookupEntities });

    if (!booking) {
        return {
            reply: hasBookingEntity(lookupEntities)
                ? "I could not find that booking on your account. Please check the PNR or booking reference."
                : "I could not find any bookings on your account yet.",
            suggestions: ["Find my latest booking", "Check my PNR status", "How do I book a ticket?"]
        };
    }

    const payment = await findLatestPaymentForBooking(booking);

    return {
        reply: buildBookingReply(booking, { heading: "I found your booking.", payment }),
        booking,
        payment,
        suggestions: ["Payment status", "Check my PNR status", "Cancel booking"]
    };
};

const handlePaymentStatus = async ({ userId, entities, context }) => {
    if (!userId) {
        return {
            reply: requiresLoginReply,
            authRequired: true,
            suggestions: ["Login", "Open PNR Status", "How do I book a ticket?"]
        };
    }

    const lookupEntities = {
        ...getContextEntities(context),
        ...Object.fromEntries(
            Object.entries(entities).filter(([, value]) => Boolean(value))
        )
    };

    if (lookupEntities.transactionId) {
        const result = await findPaymentByTransactionForUser({
            userId,
            transactionId: lookupEntities.transactionId
        });

        if (result.payment && result.booking) {
            return {
                reply: buildPaymentReply(result.booking, result.payment),
                booking: result.booking,
                payment: result.payment,
                suggestions: ["Find my latest booking", "Check my PNR status", "Cancel booking"]
            };
        }
    }

    const booking = await findBookingForUser({ userId, ...lookupEntities });

    if (!booking) {
        return {
            reply: lookupEntities.transactionId
                ? `I could not find transaction ${lookupEntities.transactionId} on your account.`
                : "I could not find a booking to check payment for. Please share a PNR, booking reference, or transaction ID.",
            suggestions: ["Find my latest booking", "Check my PNR status"]
        };
    }

    const payment = await findLatestPaymentForBooking(booking);

    return {
        reply: buildPaymentReply(booking, payment),
        booking,
        payment,
        suggestions: ["Find my latest booking", "Check my PNR status", "Cancel booking"]
    };
};

const handleCancelBooking = async ({ userId, entities, context }) => {
    if (!userId) {
        return {
            reply: requiresLoginReply,
            authRequired: true,
            suggestions: ["Login", "How do I book a ticket?"]
        };
    }

    const lookupEntities = hasBookingEntity(entities)
        ? entities
        : getContextEntities(context);

    const booking = await findBookingForUser({ userId, ...lookupEntities });

    if (!booking) {
        return {
            reply: "Please share the PNR or booking reference. You can also open My Bookings and select the ticket you want to cancel.",
            suggestions: ["Find my latest booking", "Check my PNR status"]
        };
    }

    const payment = await findLatestPaymentForBooking(booking);

    if (booking.cancellationStatus === "FULLY_CANCELLED") {
        return {
            reply: buildBookingReply(booking, {
                heading: "This booking is already fully cancelled.",
                payment
            }),
            booking,
            payment,
            suggestions: ["Find my latest booking", "Payment status"]
        };
    }

    return {
        reply: [
            buildBookingReply(booking, {
                heading: "I found the booking you want to cancel.",
                payment
            }),
            "For safety, cancellation is completed from My Bookings. Open this ticket there and choose Cancel."
        ].join("\n"),
        booking,
        payment,
        suggestions: ["Find my latest booking", "Payment status", "Check my PNR status"]
    };
};

exports.sendMessage = async (req, res) => {
    try {
        const message = String(req.body?.message || "").trim();
        const context = req.body?.context && typeof req.body.context === "object"
            ? req.body.context
            : {};

        if (message.length < MIN_MESSAGE_LENGTH) {
            return res.status(400).json({
                message: "Please enter a message for the assistant."
            });
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({
                message: `Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`
            });
        }

        const userId = req.user?.id || null;
        const entities = extractEntities(message);
        let intent = detectIntent(message);

        if (intent === "fallback") {
            if (entities.transactionId) intent = "payment_status";
            else if (entities.pnrNumber) intent = "pnr_status";
            else if (entities.bookingToken || entities.objectId) intent = "booking_status";
        }

        if (!DATA_INTENTS.includes(intent)) {
            return res.status(200).json(
                responsePayload({
                    reply: staticCatalog[intent] || staticCatalog.fallback,
                    intent,
                    authenticated: Boolean(userId),
                    suggestions: defaultSuggestions
                })
            );
        }

        let result;

        switch (intent) {
            case "pnr_status":
                result = await handlePnrStatus({ userId, entities, context });
                break;
            case "booking_status":
                result = await handleBookingStatus({ userId, entities, context, message });
                break;
            case "payment_status":
                result = await handlePaymentStatus({ userId, entities, context });
                break;
            case "cancel_booking":
                result = await handleCancelBooking({ userId, entities, context });
                break;
            default:
                result = { reply: staticCatalog.fallback };
        }

        return res.status(200).json(
            responsePayload({
                intent,
                authenticated: Boolean(userId),
                ...result
            })
        );
    } catch (error) {
        console.error("Chatbot error:", error);

        return res.status(500).json({
            reply: "Something went wrong while checking that. Please try again in a moment, or use My Bookings / PNR Status directly.",
            mode: "error",
            source: "railgo-chatbot",
            suggestions: defaultSuggestions
        });
    }
};

exports.healthCheck = (req, res) => {
    return res.status(200).json({
        status: "ok",
        service: "railgo-chatbot",
        mode: "live"
    });
};
