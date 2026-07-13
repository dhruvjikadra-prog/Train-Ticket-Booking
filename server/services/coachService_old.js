const Coach = require("../models/Coach");
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

    // Store date-only values at UTC midnight for compatibility with existing data.
    return new Date(`${journeyDate}T00:00:00.000Z`);
};

const getMapValue = (map, key, fallback) => {
    if (map instanceof Map) {
        return map.get(key) ?? fallback;
    }

    return map?.[key] ?? fallback;
};

const buildCoachDocuments = ({
    train,
    inventory,
    journeyDate,
    classCode
}) => {
    const config = getCoachConfig(classCode);

    if (!config) {
        throw new Error(`Unsupported class code: ${classCode}`);
    }

    const trainClass = train.classes.find((item) => item.code === classCode);
    const availableCount = Number(
        getMapValue(inventory.availability, classCode, 0)
    );
    const bookedSeatCodes = new Set(
        getMapValue(inventory.bookedSeats, classCode, [])
    );
    const configuredCapacity = Number(trainClass?.totalSeats || 0);
    const totalCapacity = Math.max(
        configuredCapacity,
        availableCount + bookedSeatCodes.size
    );

    if (totalCapacity <= 0) {
        return [];
    }

    const coachCount = Math.ceil(totalCapacity / config.seatsPerCoach);
    const documents = [];
    let remainingAvailable = availableCount;
    let globalSeatIndex = 0;

    for (let coachIndex = 1; coachIndex <= coachCount; coachIndex++) {
        const coachCode = `${config.prefix}${coachIndex}`;
        const remainingCapacity = totalCapacity - globalSeatIndex;
        const capacity = Math.min(config.seatsPerCoach, remainingCapacity);
        const seats = [];

        for (let seatNumber = 1; seatNumber <= capacity; seatNumber++) {
            const seatCode = `${coachCode}-${seatNumber}`;
            let status;

            if (bookedSeatCodes.has(seatCode)) {
                status = "BOOKED";
            } else if (remainingAvailable > 0) {
                status = "AVAILABLE";
                remainingAvailable--;
            } else {
                status = "BLOCKED";
            }

            seats.push(buildSeat({
                classCode,
                coachCode,
                seatNumber,
                status
            }));
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

const ensureCoachesForJourney = async ({
    trainId,
    journeyDate,
    classCode
}) => {
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

    const [train, inventory] = await Promise.all([
        Train.findById(trainId).lean(),
        SeatInventory.findOne({
            trainId,
            journeyDate: dateFilter
        }).lean()
    ]);

    if (!train || !inventory) {
        return [];
    }

    const documents = buildCoachDocuments({
        train,
        inventory,
        journeyDate,
        classCode: normalizedClassCode
    });

    if (documents.length === 0) {
        return [];
    }

    try {
        await Coach.insertMany(documents, { ordered: false });
    } catch (error) {
        // Another request may have initialized the same coaches first.
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

const releaseExpiredHolds = async ({
    trainId,
    journeyDate,
    classCode
}) => {
    const dateFilter = buildJourneyDateFilter(journeyDate);

    if (!dateFilter) return;

    await Coach.updateMany(
        {
            trainId,
            journeyDate: dateFilter,
            classCode,
            seats: {
                $elemMatch: {
                    status: "HELD",
                    holdExpiresAt: { $lte: new Date() }
                }
            }
        },
        {
            $set: {
                "seats.$[seat].status": "AVAILABLE",
                "seats.$[seat].bookingId": null,
                "seats.$[seat].bookingToken": null,
                "seats.$[seat].fromStation": null,
                "seats.$[seat].toStation": null,
                "seats.$[seat].holdExpiresAt": null
            }
        },
        {
            arrayFilters: [
                {
                    "seat.status": "HELD",
                    "seat.holdExpiresAt": { $lte: new Date() }
                }
            ]
        }
    );
};

const findSeatDocuments = async (booking, seatCodes) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    return Coach.find({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        "seats.seatCode": { $in: seatCodes }
    });
};

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
    const seatByCode = new Map();

    coachDocuments.forEach((coach) => {
        coach.seats.forEach((seat) => {
            if (uniqueSeatCodes.includes(seat.seatCode)) {
                seatByCode.set(seat.seatCode, { coach, seat });
            }
        });
    });

    if (seatByCode.size !== uniqueSeatCodes.length) {
        throw new Error("One or more selected seats do not exist.");
    }

    for (const seatCode of uniqueSeatCodes) {
        const { seat } = seatByCode.get(seatCode);
        const heldByThisBooking =
            seat.status === "HELD" &&
            seat.bookingToken === booking.bookingToken;

        if (seat.status !== "AVAILABLE" && !heldByThisBooking) {
            throw new Error(`${seatCode} is no longer available.`);
        }
    }

    const newlyHeld = [];
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    try {
        for (const seatCode of uniqueSeatCodes) {
            const { coach, seat } = seatByCode.get(seatCode);

            if (
                seat.status === "HELD" &&
                seat.bookingToken === booking.bookingToken
            ) {
                continue;
            }

            const result = await Coach.updateOne(
                {
                    _id: coach._id,
                    seats: {
                        $elemMatch: {
                            seatCode,
                            status: "AVAILABLE"
                        }
                    }
                },
                {
                    $set: {
                        "seats.$[seat].status": "HELD",
                        "seats.$[seat].bookingId": booking._id,
                        "seats.$[seat].bookingToken": booking.bookingToken,
                        "seats.$[seat].fromStation": booking.fromStation,
                        "seats.$[seat].toStation": booking.toStation,
                        "seats.$[seat].holdExpiresAt": holdExpiresAt
                    }
                },
                {
                    arrayFilters: [
                        {
                            "seat.seatCode": seatCode,
                            "seat.status": "AVAILABLE"
                        }
                    ]
                }
            );

            if (result.modifiedCount !== 1) {
                throw new Error(`${seatCode} was selected by another user.`);
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

    await Coach.updateMany(
        {
            trainId: booking.trainId,
            journeyDate: dateFilter,
            classCode: booking.classCode,
            seats: {
                $elemMatch: {
                    seatCode: { $in: seatCodes },
                    bookingToken: booking.bookingToken,
                    status: "HELD"
                }
            }
        },
        {
            $set: {
                "seats.$[seat].status": "AVAILABLE",
                "seats.$[seat].bookingId": null,
                "seats.$[seat].bookingToken": null,
                "seats.$[seat].fromStation": null,
                "seats.$[seat].toStation": null,
                "seats.$[seat].holdExpiresAt": null
            }
        },
        {
            arrayFilters: [
                {
                    "seat.seatCode": { $in: seatCodes },
                    "seat.bookingToken": booking.bookingToken,
                    "seat.status": "HELD"
                }
            ]
        }
    );
};

const releaseUnselectedSeats = async (booking, selectedSeatCodes) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    await Coach.updateMany(
        {
            trainId: booking.trainId,
            journeyDate: dateFilter,
            classCode: booking.classCode,
            "seats.bookingToken": booking.bookingToken
        },
        {
            $set: {
                "seats.$[seat].status": "AVAILABLE",
                "seats.$[seat].bookingId": null,
                "seats.$[seat].bookingToken": null,
                "seats.$[seat].fromStation": null,
                "seats.$[seat].toStation": null,
                "seats.$[seat].holdExpiresAt": null
            }
        },
        {
            arrayFilters: [
                {
                    "seat.bookingToken": booking.bookingToken,
                    "seat.status": "HELD",
                    "seat.seatCode": { $nin: selectedSeatCodes }
                }
            ]
        }
    );
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
        await Coach.updateMany(
            {
                trainId: booking.trainId,
                journeyDate: dateFilter,
                classCode: booking.classCode,
                "seats.bookingToken": booking.bookingToken
            },
            {
                $set: {
                    "seats.$[seat].status": "HELD",
                    "seats.$[seat].holdExpiresAt": holdExpiresAt
                }
            },
            {
                arrayFilters: [
                    {
                        "seat.seatCode": { $in: seatCodes },
                        "seat.bookingToken": booking.bookingToken,
                        "seat.status": "BOOKED"
                    }
                ]
            }
        );
    }

    if (inventorySeatCodes.length > 0) {
        await SeatInventory.updateOne(
            {
                trainId: booking.trainId,
                journeyDate: dateFilter
            },
            {
                $pullAll: {
                    [`bookedSeats.${booking.classCode}`]: inventorySeatCodes
                },
                $inc: {
                    [`availability.${booking.classCode}`]:
                        inventorySeatCodes.length
                }
            }
        );
    }
};

/**
 * Atomically finds and claims exactly ONE currently-AVAILABLE seat for the
 * given booking's train/journeyDate/classCode, flipping it straight to
 * BOOKED and syncing the Seat inventory counters. Unlike holdSeatsForBooking
 * this never puts the seat in a HELD state — it's meant for promoting an
 * already-paid WL booking straight to a confirmed seat, not a fresh
 * user-driven selection.
 *
 * Concurrency-safe: seats are claimed one at a time via a compare-and-swap
 * (seatCode + status:"AVAILABLE" in both the query and the arrayFilter), so
 * two promotions racing for the same seat can never both "win" it.
 *
 * Returns the claimed seatCode, or null if no seat is available right now
 * (callers should treat this as "the queue is stuck until more seats free
 * up" and stop promoting further passengers).
 */
const claimAvailableSeatForBooking = async (booking) => {
    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    if (!dateFilter) return null;

    const coaches = await Coach.find({
        trainId: booking.trainId,
        journeyDate: dateFilter,
        classCode: booking.classCode,
        seats: { $elemMatch: { status: "AVAILABLE" } }
    })
        .sort({ position: 1 })
        .lean();

    for (const coach of coaches) {
        const availableSeats = coach.seats
            .filter((seat) => seat.status === "AVAILABLE")
            .sort((a, b) => a.seatNumber - b.seatNumber);

        for (const seat of availableSeats) {
            const claimed = await Coach.updateOne(
                {
                    _id: coach._id,
                    seats: {
                        $elemMatch: {
                            seatCode: seat.seatCode,
                            status: "AVAILABLE"
                        }
                    }
                },
                {
                    $set: {
                        "seats.$[seat].status": "BOOKED",
                        "seats.$[seat].bookingId": booking._id,
                        "seats.$[seat].bookingToken": booking.bookingToken,
                        "seats.$[seat].fromStation": booking.fromStation,
                        "seats.$[seat].toStation": booking.toStation,
                        "seats.$[seat].holdExpiresAt": null
                    }
                },
                {
                    arrayFilters: [
                        {
                            "seat.seatCode": seat.seatCode,
                            "seat.status": "AVAILABLE"
                        }
                    ]
                }
            );

            if (claimed.modifiedCount !== 1) {
                // Another promotion (or booking) grabbed it a moment ago.
                continue;
            }

            const inventoryResult = await SeatInventory.updateOne(
                {
                    trainId: booking.trainId,
                    journeyDate: dateFilter,
                    [`availability.${booking.classCode}`]: { $gte: 1 },
                    [`bookedSeats.${booking.classCode}`]: { $ne: seat.seatCode }
                },
                {
                    $addToSet: {
                        [`bookedSeats.${booking.classCode}`]: seat.seatCode
                    },
                    $inc: {
                        [`availability.${booking.classCode}`]: -1
                    }
                }
            );

            if (inventoryResult.modifiedCount !== 1) {
                // Inventory disagreed with the Coach doc — put the seat back
                // exactly as it was and try the next available seat.
                await Coach.updateOne(
                    { _id: coach._id },
                    {
                        $set: {
                            "seats.$[seat].status": "AVAILABLE",
                            "seats.$[seat].bookingId": null,
                            "seats.$[seat].bookingToken": null,
                            "seats.$[seat].fromStation": null,
                            "seats.$[seat].toStation": null,
                            "seats.$[seat].holdExpiresAt": null
                        }
                    },
                    {
                        arrayFilters: [
                            {
                                "seat.seatCode": seat.seatCode,
                                "seat.status": "BOOKED"
                            }
                        ]
                    }
                );
                continue;
            }

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
        return {
            releasedSeatCodes: [],
            inventorySeatCodes: []
        };
    }

    const dateFilter = buildJourneyDateFilter(booking.journeyDate);

    if (!dateFilter) {
        throw new Error("Journey date is invalid.");
    }

    const inventory = await SeatInventory.findOne({
        trainId: booking.trainId,
        journeyDate: dateFilter
    }).lean();

    const bookedSeats = new Set(
        getMapValue(inventory?.bookedSeats, booking.classCode, [])
    );
    const inventorySeatCodes = normalizedSeatCodes.filter((seatCode) =>
        bookedSeats.has(seatCode)
    );

    await Coach.updateMany(
        {
            trainId: booking.trainId,
            journeyDate: dateFilter,
            classCode: booking.classCode,
            seats: {
                $elemMatch: {
                    seatCode: { $in: normalizedSeatCodes },
                    bookingToken: booking.bookingToken,
                    status: { $in: ["BOOKED", "HELD"] }
                }
            }
        },
        {
            $set: {
                "seats.$[seat].status": "AVAILABLE",
                "seats.$[seat].bookingId": null,
                "seats.$[seat].bookingToken": null,
                "seats.$[seat].fromStation": null,
                "seats.$[seat].toStation": null,
                "seats.$[seat].holdExpiresAt": null
            }
        },
        {
            arrayFilters: [
                {
                    "seat.seatCode": { $in: normalizedSeatCodes },
                    "seat.bookingToken": booking.bookingToken,
                    "seat.status": { $in: ["BOOKED", "HELD"] }
                }
            ]
        }
    );

    if (inventory && inventorySeatCodes.length > 0) {
        await SeatInventory.updateOne(
            {
                _id: inventory._id
            },
            {
                $pullAll: {
                    [`bookedSeats.${booking.classCode}`]: inventorySeatCodes
                },
                $inc: {
                    [`availability.${booking.classCode}`]:
                        inventorySeatCodes.length
                }
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
        (booking.selectedSeats || []).map((seatCode) =>
            String(seatCode).trim().toUpperCase()
        )
    )];

    // Some passengers may be WL (fewer seats were available than
    // passengers at seat-selection time), so selectedSeats only needs to
    // match the number of passengers actually holding a CNF seat, not the
    // full passenger count.
    const cnfPassengerCount = booking.passengers.filter(
        (passenger) => passenger.reservationStatus === "CNF"
    ).length;

    if (
        seatCodes.length === 0 ||
        seatCodes.length !== cnfPassengerCount
    ) {
        throw new Error("The booking does not have a valid seat selection.");
    }

    const coachDocuments = await findSeatDocuments(booking, seatCodes);
    const seatByCode = new Map();

    coachDocuments.forEach((coach) => {
        coach.seats.forEach((seat) => {
            if (seatCodes.includes(seat.seatCode)) {
                seatByCode.set(seat.seatCode, { coach, seat });
            }
        });
    });

    if (seatByCode.size !== seatCodes.length) {
        throw new Error("One or more selected seats could not be found.");
    }

    for (const seatCode of seatCodes) {
        const { seat } = seatByCode.get(seatCode);
        const belongsToBooking =
            seat.bookingToken === booking.bookingToken &&
            String(seat.bookingId) === String(booking._id);

        if (
            !belongsToBooking ||
            !["HELD", "BOOKED"].includes(seat.status)
        ) {
            throw new Error(
                `${seatCode} is no longer held for this booking.`
            );
        }
    }

    const newlyBooked = [];
    let inventorySeatCodes = [];

    try {
        for (const seatCode of seatCodes) {
            const { coach, seat } = seatByCode.get(seatCode);

            if (seat.status === "BOOKED") continue;

            const result = await Coach.updateOne(
                {
                    _id: coach._id,
                    seats: {
                        $elemMatch: {
                            seatCode,
                            status: "HELD",
                            bookingToken: booking.bookingToken,
                            bookingId: booking._id
                        }
                    }
                },
                {
                    $set: {
                        "seats.$[seat].status": "BOOKED",
                        "seats.$[seat].fromStation": booking.fromStation,
                        "seats.$[seat].toStation": booking.toStation,
                        "seats.$[seat].holdExpiresAt": null
                    }
                },
                {
                    arrayFilters: [
                        {
                            "seat.seatCode": seatCode,
                            "seat.status": "HELD",
                            "seat.bookingToken": booking.bookingToken,
                            "seat.bookingId": booking._id
                        }
                    ]
                }
            );

            if (result.modifiedCount !== 1) {
                throw new Error(
                    `${seatCode} could not be confirmed for this booking.`
                );
            }

            newlyBooked.push(seatCode);
        }

        const dateFilter = buildJourneyDateFilter(booking.journeyDate);
        const inventory = await SeatInventory.findOne({
            trainId: booking.trainId,
            journeyDate: dateFilter
        }).lean();

        if (!inventory) {
            throw new Error("Seat inventory was not found.");
        }

        const bookedSeats = new Set(
            getMapValue(
                inventory.bookedSeats,
                booking.classCode,
                []
            )
        );
        inventorySeatCodes = seatCodes.filter(
            (seatCode) => !bookedSeats.has(seatCode)
        );

        if (inventorySeatCodes.length > 0) {
            const availabilityPath =
                `availability.${booking.classCode}`;
            const bookedSeatsPath =
                `bookedSeats.${booking.classCode}`;

            const result = await SeatInventory.updateOne(
                {
                    _id: inventory._id,
                    [availabilityPath]: {
                        $gte: inventorySeatCodes.length
                    },
                    [bookedSeatsPath]: {
                        $nin: inventorySeatCodes
                    }
                },
                {
                    $addToSet: {
                        [bookedSeatsPath]: {
                            $each: inventorySeatCodes
                        }
                    },
                    $inc: {
                        [availabilityPath]:
                            -inventorySeatCodes.length
                    }
                }
            );

            if (result.modifiedCount !== 1) {
                throw new Error(
                    "Seat availability changed before payment confirmation."
                );
            }
        }

        return {
            seatCodes,
            newlyBooked,
            inventorySeatCodes
        };
    } catch (error) {
        await rollbackBookedSeatsForBooking(
            booking,
            newlyBooked,
            inventorySeatCodes
        ).catch((rollbackError) => {
            console.error(
                "payment seat rollback error:",
                rollbackError
            );
        });
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
    claimAvailableSeatForBooking
};