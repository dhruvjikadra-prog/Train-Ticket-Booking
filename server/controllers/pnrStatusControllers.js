const Booking = require("../models/Booking");
const { createMathCaptcha, verifyMathCaptcha } = require("../utils/captcha");

const normalizePnr = (value) => String(value || "").replace(/\D/g, "");

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
        return "CANCELLED";
    }

    if (booking.cancellationStatus === "PARTIAL_CANCELLED") {
        return "PARTIAL_CANCELLED";
    }

    return (booking.reservationStatus || getLifecycleStatus(booking)).toUpperCase();
};

const getTrainName = (booking) => {
    const train = booking.trainId || {};
    return train.trainName || train.name || undefined;
};

const getRouteStop = (booking, stationCode) => {
    const train = booking.trainId || {};
    const route = Array.isArray(train.route) ? train.route : [];
    const code = String(stationCode || "").toUpperCase();

    return route.find((stop) => stop.stationCode?.toUpperCase() === code) || null;
};

const toPublicPnrStatus = (booking) => {
    const fromStop = getRouteStop(booking, booking.fromStation);
    const toStop = getRouteStop(booking, booking.toStation);
    const train = booking.trainId || {};

    return {
        pnrNumber: booking.pnrNumber,
        status: getDisplayStatus(booking),
        bookingStatus: getLifecycleStatus(booking),
        reservationStatus: booking.reservationStatus,
        paymentStatus: booking.paymentStatus,
        cancellationStatus: booking.cancellationStatus,
        train: {
            number: booking.trainNo || train.trainNumber,
            name: getTrainName(booking)
        },
        journey: {
            fromStation: booking.fromStation,
            toStation: booking.toStation,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode,
            departureTime:
                fromStop?.departureTime ||
                train.departureTime ||
                train.source?.departureTime ||
                null,
            arrivalTime:
                toStop?.arrivalTime ||
                train.arrivalTime ||
                train.destination?.arrivalTime ||
                null
        },
        passengers: Array.isArray(booking.passengers)
            ? booking.passengers.map((passenger, index) => ({
                number: index + 1,
                seatNumber: passenger.seatNumber || null,
                cancelledSeatNumber: passenger.cancelledSeatNumber || null,
                reservationStatus: passenger.reservationStatus,
                status: passenger.status
            }))
            : [],
        timeline: {
            bookedAt: booking.createdAt,
            paidAt: booking.paidAt,
            ticketGeneratedAt: booking.ticketGeneratedAt,
            cancelledAt: booking.cancelledAt
        }
    };
};

exports.getCaptcha = (req, res, next) => {
    try {
        const { question, token } = createMathCaptcha();
        return res.status(200).json({ question, token });
    } catch (error) {
        return next(error);
    }
};

exports.searchByPnr = async (req, res) => {
    try {
        const pnrNumber = normalizePnr(req.body?.pnrNumber);
        const { captchaToken, captchaAnswer } = req.body || {};

        if (!verifyMathCaptcha(captchaToken, captchaAnswer)) {
            return res.status(400).json({
                message: "Verification failed. Refresh the captcha and try again."
            });
        }

        if (!/^\d{10}$/.test(pnrNumber)) {
            return res.status(400).json({
                message: "Enter a valid 10-digit PNR number."
            });
        }

        const booking = await Booking.findOne({ pnrNumber })
            .populate(
                "trainId",
                "name trainName trainNumber source destination route departureTime arrivalTime"
            )
            .lean();

        if (!booking) {
            return res.status(404).json({
                message: "No booking found for this PNR number."
            });
        }

        return res.status(200).json({
            booking: toPublicPnrStatus(booking)
        });
    } catch (error) {
        console.error("searchByPnr error:", error);
        return res.status(500).json({
            message: "Unable to fetch PNR status right now."
        });
    }
};
