const crypto = require("crypto");
const Booking = require("../models/Booking");
const { getCoachConfig } = require("../utils/coachLayout");
const {
    holdSeatsForBooking,
    releaseHeldSeats,
    releaseUnselectedSeats,
    releaseSeatsForBooking
} = require("../services/coachService");

const generateBookingToken = () =>
    crypto.randomBytes(24).toString("hex");

const BOOKING_TYPES = Booking.BOOKING_TYPES || ["CONFIRMED", "RAC", "WL"];

// Maps a booking's overall type to the reservation status its passengers
// should carry. CONFIRMED bookings get seats and are CNF; RAC/WL bookings
// skip seat selection entirely, so their passengers stay RAC/WL until a
// seat is later allotted (e.g. at chart preparation).
const reservationStatusForBookingType = (bookingType) => {
    if (bookingType === "RAC") return "RAC";
    if (bookingType === "WL") return "WL";
    return "CNF";
};

// Only CONFIRMED bookings go through the Seat Selection step. RAC/WL
// bookings (no seats available at booking time) skip straight to Review.
const requiresSeatSelection = (booking) =>
    (booking.bookingType || "CONFIRMED") === "CONFIRMED";

const isFullyCancelled = (booking) =>
    booking.cancellationStatus === "FULLY_CANCELLED" ||
    booking.status === "cancelled";

const getBookingLifecycleStatus = (booking) => {
    if (booking.bookingStatus) return booking.bookingStatus;
    if (booking.status === "confirmed") return "completed";
    if (booking.status === "seats_selected") return "seat_selected";
    return booking.status || "pending";
};

const expireBookingSession = async (booking) => {
    const lifecycleStatus = getBookingLifecycleStatus(booking);

    if (
        lifecycleStatus === "completed" ||
        lifecycleStatus === "expired" ||
        booking.paymentStatus === "paid"
    ) {
        return booking;
    }

    const selectedSeatCodes = (booking.selectedSeats || []).filter(Boolean);

    if (selectedSeatCodes.length > 0) {
        await releaseSeatsForBooking(booking, selectedSeatCodes);
    }

    booking.passengers = booking.passengers.map((passenger) => {
        const plainPassenger = passenger.toObject
            ? passenger.toObject()
            : passenger;

        return {
            ...plainPassenger,
            cancelledSeatNumber:
                plainPassenger.cancelledSeatNumber ||
                plainPassenger.seatNumber,
            seatNumber: null,
            reservationStatus: "CAN",
            status: "CANCELLED",
            cancellationReason: "Booking expired before payment."
        };
    });

    booking.selectedSeats = [];
    booking.bookingStatus = "expired";
    booking.status = "expired";
    booking.reservationStatus = "CAN";
    booking.cancellationStatus = "FULLY_CANCELLED";
    booking.paymentProcessingStartedAt = null;
    booking.expiresAt = null;

    if (booking.paymentStatus === "processing") {
        booking.paymentStatus = "failed";
    }

    await booking.save();
    return booking;
};

const createBooking = async (req, res) => {
    try {
        const {
            userId,
            trainId,
            trainNo,
            fromStation,
            toStation,
            journeyDate,
            classCode,
            farePerPassenger,
            totalFare,
            contact,
            passengers
        } = req.body;

        const requestedBookingType = String(
            req.body.bookingType || "CONFIRMED"
        ).toUpperCase();

        if (!BOOKING_TYPES.includes(requestedBookingType)) {
            return res.status(400).json({
                message: "Invalid booking type."
            });
        }

        if (!userId || !trainId || !trainNo || !fromStation || !toStation ||
            !journeyDate || !classCode || !contact || !passengers?.length) {
            return res.status(400).json({
                message: "Missing required booking fields."
            });
        }

        if (!/^\d{10}$/.test(contact.mobile)) {
            return res.status(400).json({ message: "Invalid mobile number." });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
            return res.status(400).json({ message: "Invalid email address." });
        }

        if (passengers.length > 6) {
            return res.status(400).json({
                message: "Maximum 6 passengers allowed."
            });
        }

        const normalizedClassCode = classCode.toUpperCase();

        if (!getCoachConfig(normalizedClassCode)) {
            return res.status(400).json({
                message: "Unsupported travel class."
            });
        }

        for (const [index, passenger] of passengers.entries()) {
            if (!passenger.name?.trim()) {
                return res.status(400).json({
                    message: `Passenger ${index + 1}: Name is required.`
                });
            }

            if (!passenger.age || Number(passenger.age) <= 0) {
                return res.status(400).json({
                    message: `Passenger ${index + 1}: Valid age is required.`
                });
            }

            if (!["Male", "Female", "Other"].includes(passenger.gender)) {
                return res.status(400).json({
                    message: `Passenger ${index + 1}: Valid gender is required.`
                });
            }
        }

        let bookingToken;
        let attempts = 0;

        do {
            bookingToken = generateBookingToken();
            attempts++;
            if (attempts > 5) {
                throw new Error("Token generation failed after too many collisions.");
            }
        } while (await Booking.exists({ bookingToken }));

        const passengerReservationStatus =
            reservationStatusForBookingType(requestedBookingType);

        const booking = await Booking.create({
            bookingToken,
            userId,
            trainId,
            trainNo,
            fromStation: fromStation.toUpperCase(),
            toStation: toStation.toUpperCase(),
            journeyDate,
            classCode: normalizedClassCode,
            bookingType: requestedBookingType,
            farePerPassenger: Number(farePerPassenger),
            totalFare: Number(totalFare),
            contact: {
                mobile: contact.mobile.trim(),
                email: contact.email.trim().toLowerCase()
            },
            passengers: passengers.map((passenger) => ({
                name: passenger.name.trim(),
                age: Number(passenger.age),
                gender: passenger.gender,
                seniorCitizen: Boolean(passenger.seniorCitizen),
                reservationStatus: passengerReservationStatus,
                status: "ACTIVE"
            })),
            bookingStatus: "pending",
            reservationStatus: passengerReservationStatus,
            paymentStatus: "pending",
            cancellationStatus: "ACTIVE",
            status: "pending"
        });

        return res.status(201).json({
            message:
                requestedBookingType === "CONFIRMED"
                    ? "Booking created successfully. Proceed to seat selection."
                    : "Booking created successfully. Seats are currently unavailable, so seat selection is skipped — proceed to review.",
            bookingToken: booking.bookingToken,
            bookingId: booking._id,
            bookingType: booking.bookingType
        });
    } catch (error) {
        console.error("createBooking error:", error);

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        return res.status(500).json({ message: error.message });
    }
};

const getBookingByToken = async (req, res) => {
    try {
        const { token } = req.params;
        const booking = await Booking.findOne({ bookingToken: token })
            .populate("trainId", "name trainNumber route classes");

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        if (booking.expiresAt && new Date() > booking.expiresAt) {
            await expireBookingSession(booking);
            return res.status(410).json({
                message: "Booking session has expired. Please start again."
            });
        }

        return res.status(200).json({ booking });
    } catch (error) {
        console.error("getBookingByToken error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

const updateSelectedSeats = async (req, res) => {
    let booking = null;
    let newlyHeldSeats = [];

    try {
        const { token } = req.params;
        const { selectedSeats } = req.body;

        if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
            return res.status(400).json({
                message: "Please provide selected seats."
            });
        }

        booking = await Booking.findOne({ bookingToken: token });

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        if (booking.expiresAt && new Date() > booking.expiresAt) {
            await expireBookingSession(booking);
            return res.status(410).json({
                message: "Booking session has expired."
            });
        }

        if (isFullyCancelled(booking)) {
            return res.status(409).json({
                message: "This booking has already been cancelled."
            });
        }

        if (!requiresSeatSelection(booking)) {
            return res.status(409).json({
                message:
                    "Seats were unavailable for this booking, so seat selection is not applicable. Please proceed to review."
            });
        }

        // Seats may run short of passengers (e.g. 1 seat left for 2
        // passengers). We no longer require an exact match — the person can
        // select anywhere from 1 seat up to one per passenger. Any
        // passenger left without a seat is marked WL instead of failing
        // the whole request.
        if (selectedSeats.length > booking.passengers.length) {
            return res.status(400).json({
                message: `Please select at most ${booking.passengers.length} seat(s).`
            });
        }

        const holdResult = await holdSeatsForBooking(booking, selectedSeats);
        newlyHeldSeats = holdResult.newlyHeld;

        const confirmedCount = holdResult.seatCodes.length;
        const isPartial = confirmedCount < booking.passengers.length;

        booking.passengers = booking.passengers.map((passenger, index) => {
            const plainPassenger = passenger.toObject();

            if (index < confirmedCount) {
                return {
                    ...plainPassenger,
                    seatNumber: holdResult.seatCodes[index],
                    reservationStatus: "CNF",
                    status: "ACTIVE",
                    cancelledAt: null,
                    cancellationReason: null
                };
            }

            // No seat left for this passenger — waitlisted within an
            // otherwise-confirmed booking. A seat can be allotted to them
            // automatically later (e.g. at chart preparation) if one frees up.
            return {
                ...plainPassenger,
                seatNumber: null,
                reservationStatus: "WL",
                status: "ACTIVE",
                cancelledAt: null,
                cancellationReason: null
            };
        });

        booking.selectedSeats = holdResult.seatCodes;
        booking.bookingStatus = "seat_selected";
        booking.reservationStatus = isPartial
            ? "PARTIAL"
            : (confirmedCount > 0 ? "CNF" : "WL");
        booking.cancellationStatus = "ACTIVE";
        booking.status = "seat_selected";
        booking.expiresAt = holdResult.holdExpiresAt;

        await booking.save();
        await releaseUnselectedSeats(booking, holdResult.seatCodes);

        return res.status(200).json({
            message: isPartial
                ? `Only ${confirmedCount} of ${booking.passengers.length} seat(s) were available. ${booking.passengers.length - confirmedCount} passenger(s) have been waitlisted. Proceed to review.`
                : "Seats updated successfully. Proceed to review.",
            bookingToken: booking.bookingToken,
            bookingId: booking._id,
            selectedSeats: booking.selectedSeats,
            waitlistedCount: booking.passengers.length - confirmedCount
        });
    } catch (error) {
        console.error("updateSelectedSeats error:", error);

        if (booking && newlyHeldSeats.length > 0) {
            await releaseHeldSeats(booking, newlyHeldSeats).catch(
                (releaseError) =>
                    console.error("seat rollback error:", releaseError)
            );
        }

        if (
            error.message?.includes("no longer available") ||
            error.message?.includes("another user")
        ) {
            return res.status(409).json({ message: error.message });
        }

        if (
            error.message?.includes("Only ") ||
            error.message?.includes("Duplicate") ||
            error.message?.includes("do not exist")
        ) {
            return res.status(400).json({ message: error.message });
        }

        return res.status(500).json({ message: "Server error." });
    }
};

const completeReview = async (req, res) => {
    try {
        const { token } = req.params;
        const booking = await Booking.findOne({ bookingToken: token });

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        if (booking.expiresAt && new Date() > booking.expiresAt) {
            await expireBookingSession(booking);
            return res.status(410).json({
                message: "Booking session has expired."
            });
        }

        if (isFullyCancelled(booking)) {
            return res.status(409).json({
                message: "This booking has already been cancelled."
            });
        }

        const lifecycleStatus = getBookingLifecycleStatus(booking);

        if (requiresSeatSelection(booking)) {
            if (
                !["seat_selected", "review_completed"].includes(lifecycleStatus) &&
                booking.status !== "seats_selected"
            ) {
                return res.status(409).json({
                    message: "Select seats before completing review."
                });
            }

            // Some passengers may be WL (fewer seats were available than
            // passengers at seat-selection time), so selectedSeats only
            // needs to match the number of passengers actually holding a
            // CNF seat, not the full passenger count.
            const cnfPassengerCount = booking.passengers.filter(
                (passenger) => passenger.reservationStatus === "CNF"
            ).length;

            if (
                !Array.isArray(booking.selectedSeats) ||
                booking.selectedSeats.length !== cnfPassengerCount ||
                cnfPassengerCount === 0
            ) {
                return res.status(400).json({
                    message: "The booking does not have a valid seat selection."
                });
            }
        } else {
            // RAC/WL bookings skip seat selection entirely, so review can be
            // completed directly from the pending state.
            if (!["pending", "review_completed"].includes(lifecycleStatus)) {
                return res.status(409).json({
                    message: "This booking cannot be reviewed at this stage."
                });
            }
        }

        booking.bookingStatus = "review_completed";
        booking.status = "review_completed";

        await booking.save();

        return res.status(200).json({
            message: "Review completed. Proceed to payment.",
            booking
        });
    } catch (error) {
        console.error("completeReview error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

const getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({
            status: { $ne: "cancelled" },
            cancellationStatus: { $ne: "FULLY_CANCELLED" }
        })
            .sort({ createdAt: -1 })
            .select("-__v");

        return res.status(200).json({
            count: bookings.length,
            bookings
        });
    } catch (error) {
        console.error("getAllBookings error:", error);
        return res.status(500).json({ message: "Server error." });
    }
};

module.exports = {
    createBooking,
    getBookingByToken,
    updateSelectedSeats,
    completeReview,
    getAllBookings
};