const Booking = require("../models/Booking");
const SeatInventory = require("../models/Seat");
const {
    claimAvailableSeatForBooking,
    releaseSeatsForBooking
} = require("./coachService");
const { buildJourneyDateFilter } = require("../utils/journeyDate");
// const sendEmail = require("./emailService");
const bookingSuccessTemplate = require("../templates/bookingSuccess");

// A passenger is "in the queue" if they're still waiting for a seat: their
// booking was placed as WL and they haven't been cancelled or upgraded yet.
const isPassengerWaiting = (passenger) =>
    passenger &&
    passenger.status !== "CANCELLED" &&
    passenger.reservationStatus === "WL";

// Flattens [{ booking, passengers: [...] }] into one FIFO list of
// { booking, passenger } pairs, oldest booking first (queried in createdAt
// order), and passengers within a booking kept in their original order.
const buildWaitlistQueue = (bookings) => {
    const queue = [];

    bookings.forEach((booking) => {
        (booking.passengers || []).forEach((passenger) => {
            if (isPassengerWaiting(passenger)) {
                queue.push({ booking, passenger });
            }
        });
    });

    return queue;
};

// After a passenger is upgraded, re-derive this booking's overall
// bookingType/reservationStatus from its passengers:
//   - fully upgraded (nobody left WL)          -> bookingType CONFIRMED, reservationStatus CNF
//   - still a mix of CNF and WL passengers      -> reservationStatus PARTIAL (bookingType unchanged)
//   - nobody upgraded yet, all still WL         -> reservationStatus WL
// This matters because a partial booking's WL passengers can be promoted
// one at a time (as seats free up one by one), so the booking can sit in
// the "some confirmed, some still waiting" state for a while.
const recalculateBookingAfterUpgrade = async (bookingId) => {
    const booking = await Booking.findById(bookingId);

    if (!booking) return null;

    const activePassengers = booking.passengers.filter(
        (passenger) => passenger.status !== "CANCELLED"
    );
    const hasWaiting = activePassengers.some(
        (passenger) => passenger.reservationStatus === "WL"
    );
    const hasConfirmed = activePassengers.some(
        (passenger) => passenger.reservationStatus === "CNF"
    );

    if (activePassengers.length > 0 && !hasWaiting) {
        booking.bookingType = "CONFIRMED";
        booking.reservationStatus = "CNF";
    } else if (hasWaiting && hasConfirmed) {
        booking.reservationStatus = "PARTIAL";
    } else {
        booking.reservationStatus = "WL";
    }

    await booking.save();
    return booking;
};

// Best-effort confirmation email; never allowed to block a promotion.
// const notifyPassengerUpgraded = async (booking, passenger, seatCode) => {
//     try {
//         if (!booking.contact?.email) return;

//         await sendEmail({
//             to: booking.contact.email,
//             subject: `Seat Confirmed - PNR ${booking.pnrNumber || booking.bookingToken}`,
//             html: bookingSuccessTemplate({
//                 passengerName: passenger.name,
//                 trainName: "",
//                 trainNumber: booking.trainNo,
//                 pnr: booking.pnrNumber,
//                 from: booking.fromStation,
//                 to: booking.toStation,
//                 journeyDate: booking.journeyDate,
//                 seatNo: seatCode
//             })
//         });
//     } catch (emailError) {
//         console.error("waitlist upgrade email error:", emailError);
//     }
// };

/**
 * Promotes waitlisted (WL) passengers to confirmed seats, one at a time, in
 * queue order (oldest paid WL booking first, passengers within a booking in
 * their original order) — for as long as seats keep being available.
 *
 * Call this right after a cancellation (or any other event) frees up one or
 * more seats for a given train/journeyDate/classCode. It is safe to call
 * even when no seats actually freed up — it will simply find nothing to
 * claim and return an empty list.
 *
 * @returns {Promise<{ upgraded: Array<{ bookingId, bookingToken, passengerId, passengerName, seatNumber }> }>}
 */
const promoteWaitlistedPassengers = async ({ trainId, journeyDate, classCode }) => {
    if (!trainId || !journeyDate || !classCode) {
        return { upgraded: [] };
    }

    const normalizedClassCode = String(classCode).toUpperCase();
    const upgraded = [];

    // FIFO: earliest-created, still-active, already-paid booking is first
    // in line — mirroring a real railway waiting list. This now covers two
    // shapes of "someone is waiting for a seat":
    //   1. Whole-booking WL (bookingType: "WL") — nobody in the booking has
    //      a seat.
    //   2. A CONFIRMED booking that came out of seat selection short on
    //      seats, leaving some passengers CNF and some WL (reservationStatus
    //      "PARTIAL" on the booking, "WL" on the affected passenger(s)).
    // Both are fetched in one query, sorted by createdAt, so a booking from
    // either category can be next in line — true FIFO across both, not
    // "all WL bookings, then all partial ones".
    const candidateBookings = await Booking.find({
        trainId,
        journeyDate,
        classCode: normalizedClassCode,
        paymentStatus: "paid",
        cancellationStatus: { $ne: "FULLY_CANCELLED" },
        bookingType: { $in: ["WL", "CONFIRMED"] },
        passengers: {
            $elemMatch: {
                reservationStatus: "WL",
                status: { $ne: "CANCELLED" }
            }
        }
    }).sort({ createdAt: 1 });

    const queue = buildWaitlistQueue(candidateBookings);

    while (queue.length > 0) {
        const { booking, passenger } = queue.shift();

        // The snapshot above could be stale by the time we get here (e.g.
        // this exact passenger was cancelled a moment ago) — skip safely.
        if (!isPassengerWaiting(passenger)) {
            continue;
        }

        const seatCode = await claimAvailableSeatForBooking(booking);

        if (!seatCode) {
            // No seats left at all right now — nobody further down the
            // queue can be promoted either, so stop here.
            break;
        }

        // Atomically claim this specific passenger's queue slot. The
        // "passengers.reservationStatus": "WL" guard means if this
        // passenger was cancelled/upgraded elsewhere between building the
        // queue and now, this update quietly does nothing.
        const claimResult = await Booking.updateOne(
            {
                _id: booking._id,
                cancellationStatus: { $ne: "FULLY_CANCELLED" },
                "passengers._id": passenger._id,
                "passengers.reservationStatus": "WL"
            },
            {
                $set: {
                    "passengers.$[p].seatNumber": seatCode,
                    "passengers.$[p].reservationStatus": "CNF"
                },
                $addToSet: { selectedSeats: seatCode }
            },
            { arrayFilters: [{ "p._id": passenger._id }] }
        );

        if (claimResult.modifiedCount !== 1) {
            // Lost the race for this passenger's slot — give the seat back
            // and move on to the next passenger instead of wasting it.
            await releaseSeatsForBooking(booking, [seatCode]);
            continue;
        }

        // This passenger just left the waiting list, so free their slot in
        // the class's waitlist counter (best-effort, never below 0).
        const dateFilter = buildJourneyDateFilter(journeyDate);
        if (dateFilter) {
            await SeatInventory.updateOne(
                {
                    trainId,
                    journeyDate: dateFilter,
                    [`waitlist.${normalizedClassCode}`]: { $gt: 0 }
                },
                { $inc: { [`waitlist.${normalizedClassCode}`]: -1 } }
            ).catch((waitlistError) =>
                console.error(
                    "waitlist counter decrement error:",
                    waitlistError
                )
            );
        }

        const refreshedBooking = await recalculateBookingAfterUpgrade(
            booking._id
        );

        upgraded.push({
            bookingId: booking._id,
            bookingToken: booking.bookingToken,
            passengerId: passenger._id,
            passengerName: passenger.name,
            seatNumber: seatCode
        });

        if (refreshedBooking) {
            await notifyPassengerUpgraded(refreshedBooking, passenger, seatCode);
        }
    }

    return { upgraded };
};

module.exports = {
    promoteWaitlistedPassengers
};