const Coach = require("../models/Coach");
const SeatReservation = require("../models/seatReservation");
const SeatInventory = require("../models/Seat");
const Train = require("../models/Train");
const {
    buildSeat,
    getCoachConfig,
    isCoachAllowedForClass
} = require("../utils/coachLayout");
const {
    buildJourneyDateFilter,
    getJourneyDateRange
} = require("../utils/journeyDate");

const getStoredJourneyDate = (journeyDate) => {
    const range = getJourneyDateRange(journeyDate);

    if (!range) {
        return null;
    }

    return new Date(`${journeyDate}T00:00:00.000Z`);
};

const getMapValue = (map, key, fallback) => {
    if (map instanceof Map) {
        return map.get(key) ?? fallback;
    }

    return map?.[key] ?? fallback;
};

/* ── Route-order helpers ──────────────────────────────────────────────
 * Every overlap check needs to know which of two station codes comes
 * first on this train's route, not just that they differ. Two segments
 * [aStart, aEnd) and [bStart, bEnd) (as route indexes) overlap iff
 * aStart < bEnd && aEnd > bStart.
 * ─────────────────────────────────────────────────────────────────── */

const getTrainRoute = async (trainId) => {
    const train = await Train.findById(trainId).select("route").lean();
    return Array.isArray(train?.route) ? train.route : [];
};

const makeStationIndexer = (route) => (stationCode) =>
    route.findIndex((station) => station.stationCode === stationCode);

const segmentsOverlap = (getStationIndex, aFrom, aTo, bFrom, bTo) => {
    const aStart = getStationIndex(aFrom);
    const aEnd = getStationIndex(aTo);
    const bStart = getStationIndex(bFrom);
    const bEnd = getStationIndex(bTo);

    return aStart < bEnd && aEnd > bStart;
};

/* ── Coach layout (static — no booking state lives here anymore) ─────── */

const buildCoachDocuments = ({ train, journeyDate, classCode }) => {
    const config = getCoachConfig(classCode);

    if (!config) {
        throw new Error(`Unsupported class code: ${classCode}`);
    }

    const trainClass = train.classes.find((item) => item.code === classCode);
    const totalCapacity = Number(trainClass?.totalSeats || 0);

    if (totalCapacity <= 0) {
        return [];
    }

    const coachCount = Math.ceil(totalCapacity / config.seatsPerCoach);
    const documents = [];
    let globalSeatIndex = 0;

    for (let coachIndex = 1; coachIndex <= coachCount; coachIndex++) {
        const coachCode = `${config.prefix}${coachIndex}`;
        const remainingCapacity = totalCapacity - globalSeatIndex;
        const capacity = Math.min(config.seatsPerCoach, remainingCapacity);
        const seats = [];

        for (let seatNumber = 1; seatNumber <= capacity; seatNumber++) {
            seats.push(buildSeat({ classCode, coachCode, seatNumber }));
            globalSeatIndex++;
        }

        documents.push({
            trainId: train._id,
            journeyDate: getStoredJourneyDate(journeyDate),
            classCode,
            coachCode,
            coachType: config.coachType,
            layoutType: config.layoutType,
            position: coachIndex,
            capacity,
            seats
        });
    }

    return documents;
};

const ensureCoachesForJourney = async ({ trainId, journeyDate, classCode }) => {
    const normalizedClassCode = (classCode || "").toUpperCase();
    const dateFilter = buildJourneyDateFilter(journeyDate);
    const config = getCoachConfig(normalizedClassCode);

    if (!dateFilter || !config) {
        return [];
    }

    const existingCoaches = await Coach.find({
        trainId,
        journeyDate: dateFilter,
        classCode: normalizedClassCode
    })
        .sort({ position: 1 })
        .lean();

    if (existingCoaches.length > 0) {
        return existingCoaches;
    }

    const [train, inventoryReleased] = await Promise.all([
        Train.findById(trainId).lean(),
        SeatInventory.exists({ trainId, journeyDate: dateFilter })
    ]);

    if (!train || !inventoryReleased) {
        return [];
    }

    const documents = buildCoachDocuments({
        train,
        journeyDate,
        classCode: normalizedClassCode
    });

    if (documents.length === 0) {
        return [];
    }

    try {
        await Coach.insertMany(documents, { ordered: false });
    } catch (error) {
        if (error.code !== 11000 && !error.writeErrors?.every(
            (item) => item.code === 11000
        )) {
            throw error;
        }
    }

    return Coach.find({
        trainId,
        journeyDate: dateFilter,
        classCode: normalizedClassCode
    })
        .sort({ position: 1 })
        .lean();
};

/* ── Reservation lookups ──────────────────────────────────────────────
 * "Active" = actually occupying the seat right now: BOOKED, or HELD with
 * a hold that hasn't expired yet. Everything else (expired HELD) is
 * treated as if it doesn't exist, even before releaseExpiredHolds
 * physically deletes it.
 * ─────────────────────────────────────────────────────────────────── */

const activeReservationFilter = () => ({
    $or: [
        { status: "BOOKED" },
        { status: "HELD", holdExpiresAt: { $gt: new Date() } }
    ]
});

const getActiveReservationsForSeats = async ({
    trainId,
    journeyDate,
    classCode,
    seatCodes
}) => {
    const dateFilter = buildJourneyDateFilter(journeyDate);

    if (!dateFilter || seatCodes.length === 0) return [];

    return SeatReservation.find({
        trainId,
        journeyDate: dateFilter,
        classCode,
        seatCode: { $in: seatCodes },
        ...activeReservationFilter()
    }).lean();
};

const groupReservationsBySeat = (reservations) => {
    const bySeat = new Map();

    reservations.forEach((reservation) => {
        if (!bySeat.has(reservation.seatCode)) {
            bySeat.set(reservation.seatCode, []);
        }

        bySeat.get(reservation.seatCode).push(reservation);
    });

    return bySeat;
};

/**
 * Computes, for every seat in `coaches`, whether it's available/held/booked
 * for the requested fromStation->toStation segment — taking into account
 * that a seat can have other active reservations for entirely different,
 * non-overlapping segments (which must NOT block this one).
 *
 * Returns a Map<seatCode, { status, heldByCurrentBooking, activeSegment }>.
 * `activeSegment` is the specific overlapping reservation's from/to (for
 * display), or null when the seat is free for this segment.
 */
const getSeatStatusesForSegment = async ({
    trainId,
    journeyDate,
    classCode,
    coaches,
    fromStation,
    toStation,
    currentBookingToken = null
}) => {
    const seatCodes = coaches.flatMap((coach) =>
        coach.seats.map((seat) => seat.seatCode)
    );

    const [reservations, route] = await Promise.all([
        getActiveReservationsForSeats({ trainId, journeyDate, classCode, seatCodes }),
        getTrainRoute(trainId)
    ]);

    const getStationIndex = makeStationIndexer(route);
    const reservationsBySeat = groupReservationsBySeat(reservations);
    const statusBySeat = new Map();

    coaches.forEach((coach) => {
        coach.seats.forEach((seat) => {
            const seatReservations = reservationsBySeat.get(seat.seatCode) || [];
            const overlapping = seatReservations.filter((reservation) =>
                segmentsOverlap(
                    getStationIndex,
                    fromStation,
                    toStation,
                    reservation.fromStation,
                    reservation.toStation
                )
            );

            const heldByCurrentBooking = overlapping.some(
                (reservation) =>
                    reservation.status === "HELD" &&
                    reservation.bookingToken === currentBookingToken
            );

            let status = "AVAILABLE";
            if (overlapping.length > 0) {
                status = overlapping.some((reservation) => reservation.status === "BOOKED")
                    ? "BOOKED"
                    : "HELD";
            }

            statusBySeat.set(seat.seatCode, {
                status,
                heldByCurrentBooking,
                activeSegment: overlapping[0]
                    ? {
                        fromStation: overlapping[0].fromStation,
                        toStation: overlapping[0].toStation
                    }
                    : null
            });
        });
    });

    return statusBySeat;
};

const releaseExpiredHolds = async ({ trainId, journeyDate, classCode }) => {
    const dateFilter = buildJourneyDateFilter(journeyDate);

    if (!dateFilter) return;

    await SeatReservation.deleteMany({
        trainId,
        journeyDate: dateFilter,
        classCode,
        status: "HELD",
        holdExpiresAt: { $lte: new Date() }
    });
};

const findSeatDocuments = async (booking, seatCodes) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    return Coach.find({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        "seats.seatCode": { $in: seatCodes }
    }).lean();
};

/* ── Hold / release / confirm ─────────────────────────────────────────── */

const holdSeatsForBooking = async (booking, seatCodes) => {
    const uniqueSeatCodes = [...new Set(
        seatCodes.map((seatCode) => String(seatCode).trim().toUpperCase())
    )];

    if (uniqueSeatCodes.length !== seatCodes.length) {
        throw new Error("Duplicate seats are not allowed.");
    }

    if (uniqueSeatCodes.some(
        (seatCode) => !isCoachAllowedForClass(booking.classCode, seatCode.split("-")[0])
    )) {
        throw new Error(
            `Only ${getCoachConfig(booking.classCode).prefix}-series coaches are allowed for ${booking.classCode}.`
        );
    }

    await ensureCoachesForJourney({
        trainId: booking.trainId,
        journeyDate: booking.journeyDate,
        classCode: booking.classCode
    });
    await releaseExpiredHolds({
        trainId: booking.trainId,
        journeyDate: booking.journeyDate,
        classCode: booking.classCode
    });

    const coachDocuments = await findSeatDocuments(booking, uniqueSeatCodes);
    const seatMetaByCode = new Map();

    coachDocuments.forEach((coach) => {
        coach.seats.forEach((seat) => {
            if (uniqueSeatCodes.includes(seat.seatCode)) {
                seatMetaByCode.set(seat.seatCode, {
                    coachCode: coach.coachCode,
                    seatNumber: seat.seatNumber
                });
            }
        });
    });

    if (seatMetaByCode.size !== uniqueSeatCodes.length) {
        throw new Error("One or more selected seats do not exist.");
    }

    const route = await getTrainRoute(booking.trainId);
    const getStationIndex = makeStationIndexer(route);

    const existingReservations = await getActiveReservationsForSeats({
        trainId: booking.trainId,
        journeyDate: booking.journeyDate,
        classCode: booking.classCode,
        seatCodes: uniqueSeatCodes
    });
    const reservationsBySeat = groupReservationsBySeat(existingReservations);

    for (const seatCode of uniqueSeatCodes) {
        const conflict = (reservationsBySeat.get(seatCode) || []).find(
            (reservation) =>
                reservation.bookingToken !== booking.bookingToken &&
                segmentsOverlap(
                    getStationIndex,
                    booking.fromStation,
                    booking.toStation,
                    reservation.fromStation,
                    reservation.toStation
                )
        );

        if (conflict) {
            throw new Error(
                `${seatCode} is no longer available for ${booking.fromStation} \u2192 ${booking.toStation}.`
            );
        }
    }

    const newlyHeld = [];
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const storedJourneyDate = getStoredJourneyDate(booking.journeyDate);

    try {
        for (const seatCode of uniqueSeatCodes) {
            const ownExisting = (reservationsBySeat.get(seatCode) || []).find(
                (reservation) => reservation.bookingToken === booking.bookingToken
            );

            if (ownExisting) {
                await SeatReservation.updateOne(
                    { _id: ownExisting._id, status: "HELD" },
                    {
                        $set: {
                            holdExpiresAt,
                            fromStation: booking.fromStation,
                            toStation: booking.toStation
                        }
                    }
                );
                continue;
            }

            const { coachCode, seatNumber } = seatMetaByCode.get(seatCode);
            let created;

            try {
                created = await SeatReservation.create({
                    bookingId: booking._id,
                    bookingToken: booking.bookingToken,
                    trainId: booking.trainId,
                    journeyDate: storedJourneyDate,
                    classCode: booking.classCode,
                    coachCode,
                    seatCode,
                    seatNumber,
                    fromStation: booking.fromStation,
                    toStation: booking.toStation,
                    status: "HELD",
                    holdExpiresAt
                });
            } catch (createError) {
                throw new Error(`${seatCode} could not be held right now.`);
            }

            const race = await SeatReservation.findOne({
                _id: { $ne: created._id },
                trainId: booking.trainId,
                journeyDate: storedJourneyDate,
                classCode: booking.classCode,
                seatCode,
                bookingToken: { $ne: booking.bookingToken },
                ...activeReservationFilter()
            }).lean();

            if (
                race &&
                segmentsOverlap(
                    getStationIndex,
                    booking.fromStation,
                    booking.toStation,
                    race.fromStation,
                    race.toStation
                )
            ) {
                await SeatReservation.deleteOne({ _id: created._id });
                throw new Error(
                    `${seatCode} was just taken by another user for an overlapping segment.`
                );
            }

            newlyHeld.push(seatCode);
        }
    } catch (error) {
        await releaseHeldSeats(booking, newlyHeld);
        throw error;
    }

    return {
        seatCodes: uniqueSeatCodes,
        newlyHeld,
        holdExpiresAt
    };
};

const releaseHeldSeats = async (booking, seatCodes = []) => {
    if (seatCodes.length === 0) return;

    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    await SeatReservation.deleteMany({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        seatCode: { $in: seatCodes },
        bookingToken: booking.bookingToken,
        status: "HELD"
    });
};

const releaseUnselectedSeats = async (booking, selectedSeatCodes) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    await SeatReservation.deleteMany({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        bookingToken: booking.bookingToken,
        status: "HELD",
        seatCode: { $nin: selectedSeatCodes }
    });
};

const rollbackBookedSeatsForBooking = async (
    booking,
    seatCodes,
    inventorySeatCodes = []
) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);
    const holdExpiresAt =
        booking.expiresAt && booking.expiresAt > new Date()
            ? booking.expiresAt
            : new Date(Date.now() + 5 * 60 * 1000);

    if (seatCodes.length > 0) {
        await SeatReservation.updateMany(
            {
                trainId: booking.trainId,
                journeyDate: dateFilter,
                classCode: booking.classCode,
                seatCode: { $in: seatCodes },
                bookingToken: booking.bookingToken,
                status: "BOOKED"
            },
            { $set: { status: "HELD", holdExpiresAt } }
        );
    }

    if (inventorySeatCodes.length > 0) {
        await SeatInventory.updateOne(
            { trainId: booking.trainId, journeyDate: dateFilter },
            {
                $pullAll: { [`bookedSeats.${booking.classCode}`]: inventorySeatCodes },
                $inc: { [`availability.${booking.classCode}`]: inventorySeatCodes.length }
            }
        );
    }
};

/**
 * Atomically finds and claims exactly ONE currently-free seat (for this
 * booking's exact fromStation->toStation segment) across the whole class,
 * flipping it straight to BOOKED. Meant for promoting an already-paid
 * WL/PARTIAL booking straight to a confirmed seat.
 *
 * "Free for this segment" now correctly accounts for other reservations on
 * the same seat that don't overlap this segment — a seat booked BH->BRC by
 * someone else does not block a WL passenger travelling ST->BH.
 *
 * Concurrency-safe via insert-then-re-check (mirrors holdSeatsForBooking).
 * Returns the claimed seatCode, or null if nothing is free right now.
 */
const claimAvailableSeatForBooking = async (booking) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    if (!dateFilter) return null;

    const coaches = await Coach.find({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode
    })
        .sort({ position: 1 })
        .lean();

    if (coaches.length === 0) return null;

    const route = await getTrainRoute(booking.trainId);
    const getStationIndex = makeStationIndexer(route);

    const seatCodes = coaches.flatMap((coach) => coach.seats.map((seat) => seat.seatCode));
    const activeReservations = await getActiveReservationsForSeats({
        trainId: booking.trainId,
        journeyDate: booking.journeyDate,
        classCode: booking.classCode,
        seatCodes
    });
    const reservationsBySeat = groupReservationsBySeat(activeReservations);
    const storedJourneyDate = getStoredJourneyDate(booking.journeyDate);

    for (const coach of coaches) {
        const candidateSeats = [...coach.seats].sort((a, b) => a.seatNumber - b.seatNumber);

        for (const seat of candidateSeats) {
            const blocked = (reservationsBySeat.get(seat.seatCode) || []).some(
                (reservation) =>
                    segmentsOverlap(
                        getStationIndex,
                        booking.fromStation,
                        booking.toStation,
                        reservation.fromStation,
                        reservation.toStation
                    )
            );

            if (blocked) continue;

            let created;

            try {
                created = await SeatReservation.create({
                    bookingId: booking._id,
                    bookingToken: booking.bookingToken,
                    trainId: booking.trainId,
                    journeyDate: storedJourneyDate,
                    classCode: booking.classCode,
                    coachCode: coach.coachCode,
                    seatCode: seat.seatCode,
                    seatNumber: seat.seatNumber,
                    fromStation: booking.fromStation,
                    toStation: booking.toStation,
                    status: "BOOKED",
                    holdExpiresAt: null
                });
            } catch (createError) {
                continue;
            }

            const race = await SeatReservation.findOne({
                _id: { $ne: created._id },
                trainId: booking.trainId,
                journeyDate: storedJourneyDate,
                classCode: booking.classCode,
                seatCode: seat.seatCode,
                ...activeReservationFilter()
            }).lean();

            if (
                race &&
                segmentsOverlap(
                    getStationIndex,
                    booking.fromStation,
                    booking.toStation,
                    race.fromStation,
                    race.toStation
                )
            ) {
                await SeatReservation.deleteOne({ _id: created._id });
                continue;
            }

            await SeatInventory.updateOne(
                {
                    trainId: booking.trainId,
                    journeyDate: dateFilter,
                    [`availability.${booking.classCode}`]: { $gte: 1 },
                    [`bookedSeats.${booking.classCode}`]: { $ne: seat.seatCode }
                },
                {
                    $addToSet: { [`bookedSeats.${booking.classCode}`]: seat.seatCode },
                    $inc: { [`availability.${booking.classCode}`]: -1 }
                }
            ).catch(() => { });

            return seat.seatCode;
        }
    }

    return null;
};

const releaseSeatsForBooking = async (booking, seatCodes = []) => {
    const normalizedSeatCodes = [...new Set(
        seatCodes
            .filter(Boolean)
            .map((seatCode) => String(seatCode).trim().toUpperCase())
    )];

    if (normalizedSeatCodes.length === 0) {
        return { releasedSeatCodes: [], inventorySeatCodes: [] };
    }

    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    if (!dateFilter) {
        throw new Error("Journey date is invalid.");
    }

    const inventory = await SeatInventory.findOne({
        trainId: booking.trainId,
        journeyDate: dateFilter
    }).lean();

    const bookedSeats = new Set(getMapValue(inventory?.bookedSeats, booking.classCode, []));
    const inventorySeatCodes = normalizedSeatCodes.filter((seatCode) => bookedSeats.has(seatCode));

    await SeatReservation.deleteMany({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        seatCode: { $in: normalizedSeatCodes },
        bookingToken: booking.bookingToken,
        status: { $in: ["BOOKED", "HELD"] }
    });

    if (inventory && inventorySeatCodes.length > 0) {
        await SeatInventory.updateOne(
            { _id: inventory._id },
            {
                $pullAll: { [`bookedSeats.${booking.classCode}`]: inventorySeatCodes },
                $inc: { [`availability.${booking.classCode}`]: inventorySeatCodes.length }
            }
        );
    }

    return {
        releasedSeatCodes: normalizedSeatCodes,
        inventorySeatCodes
    };
};

const confirmHeldSeatsForBooking = async (booking) => {
    const seatCodes = [...new Set(
        (booking.selectedSeats || []).map((seatCode) => String(seatCode).trim().toUpperCase())
    )];

    const cnfPassengerCount = booking.passengers.filter(
        (passenger) => passenger.reservationStatus === "CNF"
    ).length;

    if (seatCodes.length === 0 || seatCodes.length !== cnfPassengerCount) {
        throw new Error("The booking does not have a valid seat selection.");
    }

    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    const reservations = await SeatReservation.find({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        seatCode: { $in: seatCodes },
        bookingToken: booking.bookingToken
    });
    const reservationBySeat = new Map(
        reservations.map((reservation) => [reservation.seatCode, reservation])
    );

    if (reservationBySeat.size !== seatCodes.length) {
        throw new Error("One or more selected seats could not be found.");
    }

    for (const seatCode of seatCodes) {
        const reservation = reservationBySeat.get(seatCode);

        if (!["HELD", "BOOKED"].includes(reservation.status)) {
            throw new Error(`${seatCode} is no longer held for this booking.`);
        }
    }

    const newlyBooked = [];
    let inventorySeatCodes = [];

    try {
        for (const seatCode of seatCodes) {
            const reservation = reservationBySeat.get(seatCode);

            if (reservation.status === "BOOKED") continue;

            const result = await SeatReservation.updateOne(
                {
                    _id: reservation._id,
                    status: "HELD",
                    bookingToken: booking.bookingToken
                },
                {
                    $set: {
                        status: "BOOKED",
                        holdExpiresAt: null,
                        fromStation: booking.fromStation,
                        toStation: booking.toStation
                    }
                }
            );

            if (result.modifiedCount !== 1) {
                throw new Error(`${seatCode} could not be confirmed for this booking.`);
            }

            newlyBooked.push(seatCode);
        }

        const inventory = await SeatInventory.findOne({
            trainId: booking.trainId,
            journeyDate: dateFilter
        }).lean();

        if (!inventory) {
            throw new Error("Seat inventory was not found.");
        }

        const bookedSeats = new Set(getMapValue(inventory.bookedSeats, booking.classCode, []));
        inventorySeatCodes = seatCodes.filter((seatCode) => !bookedSeats.has(seatCode));

        if (inventorySeatCodes.length > 0) {
            const availabilityPath = `availability.${booking.classCode}`;
            const bookedSeatsPath = `bookedSeats.${booking.classCode}`;

            const result = await SeatInventory.updateOne(
                {
                    _id: inventory._id,
                    [availabilityPath]: { $gte: inventorySeatCodes.length },
                    [bookedSeatsPath]: { $nin: inventorySeatCodes }
                },
                {
                    $addToSet: { [bookedSeatsPath]: { $each: inventorySeatCodes } },
                    $inc: { [availabilityPath]: -inventorySeatCodes.length }
                }
            );

            if (result.modifiedCount !== 1) {
                throw new Error("Seat availability changed before payment confirmation.");
            }
        }

        return { seatCodes, newlyBooked, inventorySeatCodes };
    } catch (error) {
        await rollbackBookedSeatsForBooking(booking, newlyBooked, inventorySeatCodes).catch(
            (rollbackError) => {
                console.error("payment seat rollback error:", rollbackError);
            }
        );
        throw error;
    }
};

module.exports = {
    ensureCoachesForJourney,
    holdSeatsForBooking,
    releaseExpiredHolds,
    releaseHeldSeats,
    releaseUnselectedSeats,
    releaseSeatsForBooking,
    confirmHeldSeatsForBooking,
    rollbackBookedSeatsForBooking,
    claimAvailableSeatForBooking,
    getSeatStatusesForSegment
};
