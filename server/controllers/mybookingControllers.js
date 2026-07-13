const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const {
    cancelBookingPassengers
} = require("../services/bookingCancellationService");

const getRequesterId = (req) => req.user?.id || req.user?._id;

const isAdmin = (req) => req.user?.role === "admin";

const isBookingOwner = (booking, req) => {
    const requesterId = getRequesterId(req);
    return requesterId && booking.userId?.toString() === requesterId.toString();
};

const getLifecycleStatus = (booking) => {
    if (booking.bookingStatus) return booking.bookingStatus;
    if (booking.status === "confirmed") return "completed";
    if (booking.status === "seats_selected") return "seat_selected";
    return booking.status || "pending";
};

const getSummaryStatus = (booking) => {
    if (
        booking.cancellationStatus === "FULLY_CANCELLED" ||
        booking.status === "cancelled"
    ) {
        return "CANCELLED";
    }

    if (booking.cancellationStatus === "PARTIAL_CANCELLED") {
        return "PARTIAL_CANCELLED";
    }

    return getLifecycleStatus(booking).toUpperCase();
};

function toBookingSummary(booking) {
    const train = booking.trainId;

    return {
        id: booking._id?.toString(),
        token: booking.bookingToken,
        pnrNumber: booking.pnrNumber,
        bookingStatus: getSummaryStatus(booking),
        reservationStatus: booking.reservationStatus,
        paymentStatus: booking.paymentStatus,
        cancellationStatus: booking.cancellationStatus,
        journey: {
            fromStation: booking.fromStation,
            toStation: booking.toStation,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        },
        train: {
            number: booking.trainNo,
            name: train?.trainName || train?.name || undefined
        },
        passengerCount: Array.isArray(booking.passengers)
            ? booking.passengers.length
            : 0,
        activePassengerCount: Array.isArray(booking.passengers)
            ? booking.passengers.filter(
                (passenger) =>
                    passenger.status !== "CANCELLED" &&
                    passenger.reservationStatus !== "CAN"
            ).length
            : 0,
        passengers: Array.isArray(booking.passengers)
            ? booking.passengers.map((passenger) => ({
                id: passenger._id?.toString(),
                name: passenger.name,
                age: passenger.age,
                gender: passenger.gender,
                seatNumber: passenger.seatNumber,
                reservationStatus: passenger.reservationStatus,
                status: passenger.status
            }))
            : [],
        fare: {
            amount: booking.totalFare
        }
    };
}

function toBookingDetail(booking) {
    const train = booking.trainId;

    return {
        id: booking._id?.toString(),
        bookingToken: booking.bookingToken,
        pnrNumber: booking.pnrNumber,
        userId: booking.userId?.toString(),
        train: {
            id: train?._id?.toString(),
            number: booking.trainNo,
            name: train?.trainName || train?.name || undefined
        },
        fromStation: booking.fromStation,
        toStation: booking.toStation,
        journeyDate: booking.journeyDate,
        classCode: booking.classCode,
        farePerPassenger: booking.farePerPassenger,
        totalFare: booking.totalFare,
        contact: booking.contact,
        passengers: booking.passengers,
        selectedSeats: booking.selectedSeats,
        bookingStatus: getLifecycleStatus(booking),
        reservationStatus: booking.reservationStatus,
        paymentStatus: booking.paymentStatus,
        cancellationStatus: booking.cancellationStatus,
        status: booking.status,
        paidAt: booking.paidAt,
        ticketGeneratedAt: booking.ticketGeneratedAt,
        cancelledAt: booking.cancelledAt,
        cancellationReason: booking.cancellationReason,
        cancellationHistory: booking.cancellationHistory,
        expiresAt: booking.expiresAt,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
    };
}

exports.getBookingHistory = async (req, res) => {
    try {
        const userId = getRequesterId(req);

        if (!userId) {
            return res.status(401).json({
                message: "Please log in to view your bookings."
            });
        }

        const bookings = await Booking.find({ userId })
            .populate({ path: "trainId", select: "trainNo trainName name" })
            .sort({ journeyDate: -1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            bookings: bookings.map(toBookingSummary)
        });
    } catch (error) {
        console.error("getBookingHistory error:", error);
        return res.status(500).json({
            message: "Something went wrong while fetching your bookings."
        });
    }
};

exports.getBookingByToken = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                message: "A booking token is required."
            });
        }

        const booking = await Booking.findOne({ bookingToken: token })
            .populate({ path: "trainId", select: "trainNo trainName name" })
            .lean();

        if (!booking) {
            return res.status(404).json({
                message: "We couldn't find that booking."
            });
        }

        if (!isBookingOwner(booking, req) && !isAdmin(req)) {
            return res.status(403).json({
                message: "You don't have access to this booking."
            });
        }

        return res.status(200).json({
            booking: toBookingDetail(booking)
        });
    } catch (error) {
        console.error("getBookingByToken error:", error);
        return res.status(500).json({
            message: "Something went wrong while fetching this booking."
        });
    }
};

exports.getBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid booking id." });
        }

        const booking = await Booking.findById(id)
            .populate({ path: "trainId", select: "trainNo trainName name" })
            .lean();

        if (!booking) {
            return res.status(404).json({
                message: "We couldn't find that booking."
            });
        }

        if (!isBookingOwner(booking, req) && !isAdmin(req)) {
            return res.status(403).json({
                message: "You don't have access to this booking."
            });
        }

        return res.status(200).json({
            booking: toBookingDetail(booking)
        });
    } catch (error) {
        console.error("getBookingById error:", error);
        return res.status(500).json({
            message: "Something went wrong while fetching this booking."
        });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                message: "A booking token is required."
            });
        }

        const booking = await Booking.findOne({ bookingToken: token });

        if (!booking) {
            return res.status(404).json({
                message: "We couldn't find that booking."
            });
        }

        if (!isBookingOwner(booking, req) && !isAdmin(req)) {
            return res.status(403).json({
                message: "You don't have access to this booking."
            });
        }

        const result = await cancelBookingPassengers(booking, {
            cancelAll: req.body?.cancelAll,
            passengerIds: req.body?.passengerIds,
            passengerIndexes: req.body?.passengerIndexes,
            seatNumbers: req.body?.seatNumbers,
            reason: req.body?.reason
        });

        await result.booking.populate({
            path: "trainId",
            select: "trainNo trainName name"
        });

        return res.status(200).json({
            message:
                result.cancellationStatus === "FULLY_CANCELLED"
                    ? "Booking cancelled and seats released."
                    : "Selected passenger(s) cancelled and seats released.",
            booking: toBookingDetail(result.booking),
            cancelledPassengers: result.cancelledPassengers,
            releasedSeats: result.releasedSeats,
            upgradedFromWaitlist: result.upgradedFromWaitlist || []
        });
    } catch (error) {
        console.error("cancelBooking error:", error);
        return res.status(error.statusCode || 500).json({
            message:
                error.statusCode
                    ? error.message
                    : "Something went wrong while cancelling this booking."
        });
    }
};