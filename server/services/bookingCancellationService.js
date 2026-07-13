const Payment = require("../models/Payment");
const SeatInventory = require("../models/Seat");
const { releaseSeatsForBooking } = require("./coachService");
const { buildJourneyDateFilter } = require("../utils/journeyDate");
const { promoteWaitlistedPassengers } = require("./waitlistUpgradeService");

const normalizeId = (value) => String(value || "").trim();
const normalizeSeat = (value) => String(value || "").trim().toUpperCase();

const isPassengerActive = (passenger) =>
    passenger &&
    passenger.status !== "CANCELLED" &&
    passenger.reservationStatus !== "CAN";

const getBookingLifecycleStatus = (booking) => {
    if (booking.bookingStatus) return booking.bookingStatus;

    if (booking.status === "confirmed") return "completed";
    if (booking.status === "seats_selected") return "seat_selected";
    if (booking.status === "cancelled") return "expired";

    return booking.status || "pending";
};

const makeServiceError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Mirrors the increment applied to Seat.waitlist.<classCode> when a paid
// booking has WL passenger(s) — whether that's a whole booking (bookingType
// "WL") or just some passengers inside an otherwise-CONFIRMED PARTIAL
// booking (see paymentControllers.js). Whenever cancellation removes a WL
// passenger from the queue — full cancellation or partial — this gives
// their slot back. `count` is however many WL passengers among the
// cancellation targets actually leave the queue. Best-effort only — it
// must never block the actual cancellation.
const decrementWaitlistCounter = async (booking, count = 1) => {
    if (count <= 0) return;

    try {
        const journeyDateFilter = buildJourneyDateFilter(booking.journeyDate);
        if (!journeyDateFilter) return;

        const path = `waitlist.${booking.classCode}`;

        const result = await SeatInventory.updateOne(
            {
                trainId: booking.trainId,
                journeyDate: journeyDateFilter,
                [path]: { $gte: count }
            },
            { $inc: { [path]: -count } }
        );

        if (result.modifiedCount !== 1) {
            // Fewer than `count` were on record (counter drift) — clamp to
            // 0 instead of letting it go negative.
            await SeatInventory.updateOne(
                { trainId: booking.trainId, journeyDate: journeyDateFilter },
                { $set: { [path]: 0 } }
            );
        }
    } catch (waitlistError) {
        console.error("decrementWaitlistCounter error:", waitlistError);
    }
};

const getCancellationTargets = (booking, options) => {
    const cancelAll = Boolean(options.cancelAll);
    const passengerIds = new Set((options.passengerIds || []).map(normalizeId));
    const passengerIndexes = new Set(
        (options.passengerIndexes || [])
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0)
    );
    const seatNumbers = new Set((options.seatNumbers || []).map(normalizeSeat));
    const hasExplicitTargets =
        passengerIds.size > 0 ||
        passengerIndexes.size > 0 ||
        seatNumbers.size > 0;

    if (!cancelAll && !hasExplicitTargets) {
        throw makeServiceError(
            "Select passengers, seats, or set cancelAll=true to cancel a booking."
        );
    }

    return booking.passengers
        .map((passenger, index) => ({ passenger, index }))
        .filter(({ passenger, index }) => {
            if (!isPassengerActive(passenger)) return false;
            if (cancelAll) return true;

            const passengerId = normalizeId(passenger._id);
            const seatNumber = normalizeSeat(passenger.seatNumber);

            return (
                (passengerId && passengerIds.has(passengerId)) ||
                passengerIndexes.has(index) ||
                (seatNumber && seatNumbers.has(seatNumber))
            );
        });
};

const deriveReservationStatus = (activePassengers) => {
    if (activePassengers.length === 0) return "CAN";

    if (activePassengers.some((passenger) => passenger.reservationStatus === "RAC")) {
        return "RAC";
    }

    const hasWaiting = activePassengers.some(
        (passenger) => passenger.reservationStatus === "WL"
    );
    const hasConfirmed = activePassengers.some(
        (passenger) => passenger.reservationStatus === "CNF"
    );

    if (hasWaiting && hasConfirmed) {
        // A CONFIRMED booking that still has both seated and waitlisted
        // passengers after this cancellation — keep reporting it as
        // PARTIAL rather than collapsing it to a plain "WL", which would
        // wrongly suggest nobody on the booking has a seat.
        return "PARTIAL";
    }

    if (hasWaiting) {
        return "WL";
    }

    if (
        activePassengers.every(
            (passenger) => passenger.reservationStatus === "CHART_PREPARED"
        )
    ) {
        return "CHART_PREPARED";
    }

    return "CNF";
};

const cancelBookingPassengers = async (booking, options = {}) => {
    if (!booking) {
        throw makeServiceError("Booking not found.", 404);
    }

    const lifecycleStatus = getBookingLifecycleStatus(booking);

    if (booking.cancellationStatus === "FULLY_CANCELLED") {
        throw makeServiceError("This booking is already fully cancelled.", 409);
    }

    if (lifecycleStatus === "payment_processing") {
        throw makeServiceError(
            "A payment is currently processing for this booking. Please try again shortly.",
            409
        );
    }

    const activePassengers = booking.passengers.filter(isPassengerActive);

    if (activePassengers.length === 0) {
        throw makeServiceError("No active passengers remain on this booking.", 409);
    }

    const targets = getCancellationTargets(booking, options);

    if (targets.length === 0) {
        throw makeServiceError("No matching active passengers were found.", 404);
    }

    const isFullCancellation = targets.length === activePassengers.length;
    const isPaidBooking =
        booking.paymentStatus === "paid" ||
        Boolean(booking.paymentId) ||
        ["payment_success", "completed"].includes(lifecycleStatus) ||
        booking.status === "confirmed";

    if (!isFullCancellation && !isPaidBooking) {
        throw makeServiceError(
            "Partial cancellation is available after payment. Cancel the full unpaid booking or recreate it with fewer passengers."
        );
    }

    const reason = String(options.reason || "Cancelled by user").trim();
    const cancelledAt = new Date();
    const seatCodes = targets
        .map(({ passenger }) => passenger.seatNumber)
        .filter(Boolean);

    // Capture this before the forEach below overwrites reservationStatus
    // to "CAN" — used to give back the right number of waitlist slots,
    // whether this is a full cancellation or just these passengers.
    const waitlistedTargetsCount = targets.filter(
        ({ passenger }) => passenger.reservationStatus === "WL"
    ).length;

    if (isFullCancellation && seatCodes.length === 0) {
        seatCodes.push(...(booking.selectedSeats || []));
    }

    const seatRelease = await releaseSeatsForBooking(booking, seatCodes);

    targets.forEach(({ passenger, index }) => {
        const currentSeat = passenger.seatNumber || null;

        passenger.cancelledSeatNumber =
            passenger.cancelledSeatNumber || currentSeat;
        passenger.seatNumber = null;
        passenger.reservationStatus = "CAN";
        passenger.status = "CANCELLED";
        passenger.cancelledAt = cancelledAt;
        passenger.cancellationReason = reason;

        booking.cancellationHistory.push({
            passengerId: passenger._id || null,
            passengerIndex: index,
            passengerName: passenger.name,
            seatNumber: currentSeat,
            reason,
            cancelledAt
        });
    });

    const remainingActivePassengers =
        booking.passengers.filter(isPassengerActive);

    booking.selectedSeats = remainingActivePassengers
        .map((passenger) => passenger.seatNumber)
        .filter(Boolean);

    if (remainingActivePassengers.length === 0) {
        booking.cancellationStatus = "FULLY_CANCELLED";
        booking.reservationStatus = "CAN";
        booking.cancelledAt = cancelledAt;
        booking.cancellationReason = reason;
        booking.paymentProcessingStartedAt = null;
        booking.expiresAt = null;
        booking.status = "cancelled";

        if (isPaidBooking) {
            booking.bookingStatus = "completed";
            booking.paymentStatus = "refunded";

            await Payment.updateMany(
                {
                    bookingId: booking._id,
                    status: { $in: ["INITIATED", "SUCCESS"] }
                },
                {
                    $set: {
                        status: "REFUNDED",
                        refundedAt: cancelledAt
                    }
                }
            );
        } else {
            booking.bookingStatus = "expired";

            if (booking.paymentStatus === "processing") {
                booking.paymentStatus = "failed";
            }
        }
    } else {
        booking.cancellationStatus = "PARTIAL_CANCELLED";
        booking.reservationStatus =
            deriveReservationStatus(remainingActivePassengers);
        booking.bookingStatus = isPaidBooking ? "completed" : lifecycleStatus;
        booking.status = isPaidBooking ? "completed" : booking.bookingStatus;
    }

    // Give back a waitlist queue slot for every WL passenger just removed
    // from this booking — whether the whole booking was cancelled or only
    // some passengers were. Only paid bookings ever incremented the
    // counter in the first place, so only they give it back.
    if (isPaidBooking && waitlistedTargetsCount > 0) {
        await decrementWaitlistCounter(booking, waitlistedTargetsCount);
    }

    await booking.save();

    // Real seats just went back to "available" — give them to the next
    // people in the WL queue for this train/date/class, one by one, before
    // responding. Best-effort: a hiccup here must never fail the
    // cancellation the user actually asked for.
    let waitlistPromotion = { upgraded: [] };

    if (seatRelease.releasedSeatCodes.length > 0) {
        waitlistPromotion = await promoteWaitlistedPassengers({
            trainId: booking.trainId,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        }).catch((promotionError) => {
            console.error("promoteWaitlistedPassengers error:", promotionError);
            return { upgraded: [] };
        });
    }

    return {
        booking,
        cancelledPassengers: targets.map(({ index, passenger }) => ({
            passengerId: passenger._id,
            passengerIndex: index,
            name: passenger.name,
            seatNumber: passenger.cancelledSeatNumber,
            reservationStatus: passenger.reservationStatus,
            status: passenger.status
        })),
        releasedSeats: seatRelease.releasedSeatCodes,
        cancellationStatus: booking.cancellationStatus,
        upgradedFromWaitlist: waitlistPromotion.upgraded
    };
};

module.exports = {
    cancelBookingPassengers
};