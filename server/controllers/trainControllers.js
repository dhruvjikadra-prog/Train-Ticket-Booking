const Train = require("../models/Train");
const Seat = require("../models/Seat");
const Coach = require("../models/Coach");
const SeatReservation = require("../models/seatReservation");
const AdminAuditLog = require("../models/AdminAuditLog");
const Station = require("../models/Station");
const { buildJourneyDateFilter } = require("../utils/journeyDate");

const escapeRegex = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DURATION_PATTERN = /^(\d+)h\s?(\d{1,2})m$/;
const INDIA_TIME_ZONE = "Asia/Kolkata";

const CLASS_NAMES = {
    SL: "Sleeper",
    CC: "AC Chair Car",
    EC: "Executive Chair Car",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    "2S": "Second Sitting"
};

function cleanString(value) {
    return String(value || "").trim();
}

function cleanStationCode(value) {
    return cleanString(value).toUpperCase();
}

function toNumber(value) {
    if (value === "" || value === null || value === undefined) return NaN;
    return Number(value);
}

function validateTime(value, label, errors, { required = true } = {}) {
    const time = cleanString(value);

    if (!time) {
        if (required) errors.push(`${label} is required.`);
        return null;
    }

    if (!TIME_PATTERN.test(time)) {
        errors.push(`${label} must use HH:mm format.`);
        return null;
    }

    return time;
}

function timeToMinutes(value) {
    const time = cleanString(value);

    if (!TIME_PATTERN.test(time)) {
        return Number.POSITIVE_INFINITY;
    }

    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
}

function getCurrentIndiaDateTime() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: INDIA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== "literal") {
            result[part.type] = part.value;
        }
        return result;
    }, {});

    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
}

function getDepartureMinutes(train) {
    return timeToMinutes(
        train?.departureTime ||
        train?.boardingStation?.departureTime ||
        train?.source?.departureTime
    );
}

function compareTrainsByDepartureTime(a, b) {
    const firstTime = getDepartureMinutes(a);
    const secondTime = getDepartureMinutes(b);

    if (firstTime !== secondTime) {
        return firstTime - secondTime;
    }

    return String(a?.trainNumber || "").localeCompare(
        String(b?.trainNumber || ""),
        undefined,
        { numeric: true }
    );
}

function normalizeTrainPayload(body) {
    const errors = [];
    const trainNumber = cleanString(body.trainNumber);
    const name = cleanString(body.name);
    const trainType = cleanString(body.trainType) || "Express";
    const status = cleanString(body.status || "ACTIVE").toUpperCase();

    if (!/^\d{5}$/.test(trainNumber)) {
        errors.push("Train number must be exactly 5 digits.");
    }

    if (name.length < 3 || name.length > 100) {
        errors.push("Train name must be between 3 and 100 characters.");
    }

    if (trainType.length < 3 || trainType.length > 40) {
        errors.push("Train type must be between 3 and 40 characters.");
    }

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
        errors.push("Train status must be ACTIVE or INACTIVE.");
    }

    const source = {
        stationCode: cleanStationCode(body.source?.stationCode),
        stationName: cleanString(body.source?.stationName)
    };

    const destination = {
        stationCode: cleanStationCode(body.destination?.stationCode),
        stationName: cleanString(body.destination?.stationName)
    };

    if (!/^[A-Z0-9]{2,10}$/.test(source.stationCode)) {
        errors.push("Source station code is required and must be 2-10 letters/numbers.");
    }

    if (!source.stationName) {
        errors.push("Source station name is required.");
    }

    if (!/^[A-Z0-9]{2,10}$/.test(destination.stationCode)) {
        errors.push("Destination station code is required and must be 2-10 letters/numbers.");
    }

    if (!destination.stationName) {
        errors.push("Destination station name is required.");
    }

    if (
        source.stationCode &&
        destination.stationCode &&
        source.stationCode === destination.stationCode
    ) {
        errors.push("Source and destination stations must be different.");
    }

    const departureTime = validateTime(body.departureTime, "Departure time", errors);
    const arrivalTime = validateTime(body.arrivalTime, "Arrival time", errors);
    const duration = cleanString(body.duration);
    const durationMatch = duration.match(DURATION_PATTERN);

    if (!durationMatch || Number(durationMatch[2]) >= 60) {
        errors.push("Duration must look like 5h 30m.");
    }

    const distance = toNumber(body.distance);

    if (!Number.isFinite(distance) || distance <= 0) {
        errors.push("Distance must be greater than 0.");
    }

    const runningDays = Array.isArray(body.runningDays)
        ? body.runningDays.map(cleanString).filter(Boolean)
        : [];
    const uniqueRunningDays = [...new Set(runningDays)];

    if (uniqueRunningDays.length === 0) {
        errors.push("Select at least one running day.");
    }

    uniqueRunningDays.forEach((day) => {
        if (!VALID_DAYS.includes(day)) {
            errors.push(`Invalid running day: ${day}.`);
        }
    });

    const classes = Array.isArray(body.classes) ? body.classes : [];
    const normalizedClasses = classes.map((item, index) => {
        const code = cleanString(item.code).toUpperCase();
        const nameValue = cleanString(item.name) || CLASS_NAMES[code] || "";
        const farePerKm = toNumber(item.farePerKm);
        const totalSeats = toNumber(item.totalSeats);

        if (!code || !CLASS_NAMES[code]) {
            errors.push(`Class ${index + 1} has an invalid class code.`);
        }

        if (!nameValue) {
            errors.push(`Class ${index + 1} name is required.`);
        }

        if (!Number.isFinite(farePerKm) || farePerKm <= 0) {
            errors.push(`Class ${index + 1} fare per km must be greater than 0.`);
        }

        if (!Number.isInteger(totalSeats) || totalSeats <= 0) {
            errors.push(`Class ${index + 1} total seats must be a positive whole number.`);
        }

        return {
            code,
            name: nameValue,
            farePerKm,
            totalSeats
        };
    });

    if (normalizedClasses.length === 0) {
        errors.push("Add at least one travel class.");
    }

    const duplicateClasses = normalizedClasses
        .map((item) => item.code)
        .filter((code, index, codes) => code && codes.indexOf(code) !== index);

    if (duplicateClasses.length > 0) {
        errors.push("Travel classes must be unique.");
    }

    const route = Array.isArray(body.route) ? body.route : [];
    const normalizedRoute = route.map((stop, index) => {
        const stopDistance = toNumber(stop.distance);
        const stopDay = Number.parseInt(stop.day, 10);

        const normalizedStop = {
            stationCode: cleanStationCode(stop.stationCode),
            stationName: cleanString(stop.stationName),
            arrivalTime: validateTime(
                stop.arrivalTime,
                `Stop ${index + 1} arrival time`,
                errors,
                { required: index !== 0 }
            ),
            departureTime: validateTime(
                stop.departureTime,
                `Stop ${index + 1} departure time`,
                errors,
                { required: index !== route.length - 1 }
            ),
            distance: stopDistance,
            day: stopDay,
            stopNumber: index + 1
        };

        if (!/^[A-Z0-9]{2,10}$/.test(normalizedStop.stationCode)) {
            errors.push(`Stop ${index + 1} station code is required and must be 2-10 letters/numbers.`);
        }

        if (!normalizedStop.stationName) {
            errors.push(`Stop ${index + 1} station name is required.`);
        }

        if (!Number.isFinite(stopDistance) || stopDistance < 0) {
            errors.push(`Stop ${index + 1} distance must be 0 or greater.`);
        }

        if (!Number.isInteger(stopDay) || stopDay < 1 || stopDay > 7) {
            errors.push(`Stop ${index + 1} day must be between 1 and 7.`);
        }

        return normalizedStop;
    });

    if (normalizedRoute.length < 2) {
        errors.push("Route must include at least source and destination stops.");
    }

    normalizedRoute.forEach((stop, index) => {
        if (index > 0 && stop.distance <= normalizedRoute[index - 1].distance) {
            errors.push(`Stop ${index + 1} distance must be greater than the previous stop.`);
        }

        if (index > 0 && stop.day < normalizedRoute[index - 1].day) {
            errors.push(`Stop ${index + 1} day cannot be earlier than the previous stop.`);
        }
    });

    if (normalizedRoute.length >= 2) {
        const firstStop = normalizedRoute[0];
        const lastStop = normalizedRoute[normalizedRoute.length - 1];

        if (firstStop.stationCode !== source.stationCode) {
            errors.push("First route stop must match the source station.");
        }

        if (lastStop.stationCode !== destination.stationCode) {
            errors.push("Last route stop must match the destination station.");
        }

        if (firstStop.distance !== 0) {
            errors.push("First route stop distance must be 0.");
        }

        if (Number.isFinite(distance) && lastStop.distance !== distance) {
            errors.push("Last route stop distance must match the train distance.");
        }
    }

    const averageSpeedInput = toNumber(body.averageSpeed);
    const averageSpeed = Number.isFinite(averageSpeedInput) && averageSpeedInput > 0
        ? averageSpeedInput
        : 0;

    const ratingInput = toNumber(body.rating);
    const rating = Number.isFinite(ratingInput) ? ratingInput : 4.2;

    if (rating < 0 || rating > 5) {
        errors.push("Rating must be between 0 and 5.");
    }

    const facilities = {
        pantry: Boolean(body.facilities?.pantry),
        wifi: Boolean(body.facilities?.wifi),
        chargingPoint: Boolean(body.facilities?.chargingPoint),
        blanket: Boolean(body.facilities?.blanket),
        cctv: Boolean(body.facilities?.cctv)
    };

    return {
        errors,
        train: {
            trainNumber,
            name,
            trainType,
            source,
            destination,
            route: normalizedRoute,
            departureTime,
            arrivalTime,
            duration,
            distance,
            averageSpeed,
            runningDays: uniqueRunningDays,
            classes: normalizedClasses,
            facilities,
            rating,
            status
        }
    };
}

exports.createTrain = async (req, res) => {
    try {
        const { errors, train } = normalizeTrainPayload(req.body || {});

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Please fix the highlighted train details.",
                errors
            });
        }

        const exists = await Train.exists({ trainNumber: train.trainNumber });

        if (exists) {
            return res.status(409).json({
                success: false,
                message: "A train with this number already exists."
            });
        }

        const createdTrain = await Train.create(train);

        AdminAuditLog.create({
            adminId: req.admin?._id,
            action: "TRAIN_CREATED",
            ip: req.ip,
            userAgent: req.get("user-agent"),
            reason: `${createdTrain.trainNumber} ${createdTrain.name}`
        }).catch(() => { });

        return res.status(201).json({
            success: true,
            message: "Train added successfully.",
            train: createdTrain
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A train with this number already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

function isJourneyOverlap(searchFromIndex, searchToIndex, bookedFromIndex, bookedToIndex) {
    return (
        searchFromIndex < bookedToIndex &&
        searchToIndex > bookedFromIndex
    );
}

function getStationIndex(route, station) {
    if (!Array.isArray(route)) return -1;

    const value = String(station || "").trim().toUpperCase();

    return route.findIndex(stop =>
        stop.stationCode?.toUpperCase() === value ||
        stop.stationName?.toUpperCase() === value
    );
}

exports.searchTrains = async (req, res) => {
    try {
        const from = (req.query.from || "").trim();
        const to = (req.query.to || "").trim();
        const journeyDate = (req.query.date || "").trim();
        let classCode = (req.query.class || "").trim();

        const journeyDateFilter = journeyDate
            ? buildJourneyDateFilter(journeyDate)
            : null;

        if (journeyDate && !journeyDateFilter) {
            return res.status(400).json({
                success: false,
                message: "Journey date must be a valid YYYY-MM-DD date."
            });
        }

        const classMap = {
            "Sleeper": "SL",
            "AC Chair Car": "CC",
            "Executive Chair Car": "EC",
            "AC 3 Tier": "3A",
            "AC 2 Tier": "2A",
            "First AC": "1A"
        };

        classCode = classMap[classCode] || classCode;

        /* ── Build MongoDB filters ────────────────────────────── */
        const filters = {};

        // Filter by source station (stationCode OR stationName)
        if (from) {
            filters.$or = [
                { "source.stationCode": new RegExp(escapeRegex(from), "i") },
                { "source.stationName": new RegExp(escapeRegex(from), "i") },
                // Also match route array so route-based trains are found
                { "route.stationCode": new RegExp(escapeRegex(from), "i") },
                { "route.stationName": new RegExp(escapeRegex(from), "i") },
            ];
        }

        // Filter by destination station.
        // NOTE: We cannot use $and + $or together with the top-level $or above
        // without wrapping everything — so we use a separate $and clause only
        // when both from AND to are provided.
        if (from && to) {
            // Replace the top-level filter with a compound $and
            delete filters.$or;
            filters.$and = [
                {
                    $or: [
                        { "source.stationCode": new RegExp(escapeRegex(from), "i") },
                        { "source.stationName": new RegExp(escapeRegex(from), "i") },
                        { "route.stationCode": new RegExp(escapeRegex(from), "i") },
                        { "route.stationName": new RegExp(escapeRegex(from), "i") },
                    ]
                },
                {
                    $or: [
                        { "destination.stationCode": new RegExp(escapeRegex(to), "i") },
                        { "destination.stationName": new RegExp(escapeRegex(to), "i") },
                        { "route.stationCode": new RegExp(escapeRegex(to), "i") },
                        { "route.stationName": new RegExp(escapeRegex(to), "i") },
                    ]
                }
            ];
        } else if (to) {
            filters.$or = [
                { "destination.stationCode": new RegExp(escapeRegex(to), "i") },
                { "destination.stationName": new RegExp(escapeRegex(to), "i") },
                { "route.stationCode": new RegExp(escapeRegex(to), "i") },
                { "route.stationName": new RegExp(escapeRegex(to), "i") },
            ];
        }

        // Filter by class code (e.g. SL, 3A, CC …)
        if (classCode && classCode !== "All" && classCode !== "All Class") {
            filters.classes = {
                $elemMatch: { code: classCode }
            };
        }

        // Only return active trains
        filters.status = "ACTIVE";

        /* ── Query DB ─────────────────────────────────────────── */
        let trains = await Train.find(filters)
            .sort({ departureTime: 1, name: 1 })
            .limit(50);   // increased limit; client filters further

        /* ── Route-order validation (from must come before to) ── */
        if (from && to) {
            trains = trains.filter((train) => {
                if (!Array.isArray(train.route) || train.route.length === 0) {
                    // Fallback: old source/destination schema
                    return (
                        (
                            train.source?.stationCode?.toLowerCase().includes(from.toLowerCase()) ||
                            train.source?.stationName?.toLowerCase().includes(from.toLowerCase())
                        ) &&
                        (
                            train.destination?.stationCode?.toLowerCase().includes(to.toLowerCase()) ||
                            train.destination?.stationName?.toLowerCase().includes(to.toLowerCase())
                        )
                    );
                }

                const sourceIndex = train.route.findIndex(
                    (s) =>
                        s.stationCode?.toLowerCase().includes(from.toLowerCase()) ||
                        s.stationName?.toLowerCase().includes(from.toLowerCase())
                );

                const destinationIndex = train.route.findIndex(
                    (s) =>
                        s.stationCode?.toLowerCase().includes(to.toLowerCase()) ||
                        s.stationName?.toLowerCase().includes(to.toLowerCase())
                );

                return (
                    sourceIndex !== -1 &&
                    destinationIndex !== -1 &&
                    sourceIndex < destinationIndex
                );
            });
        }

        /* ── Format response ─────────────────────────────────── */
        // const inventoryByTrainId = new Map();

        // if (journeyDateFilter && trains.length > 0) {
        //     const inventories = await Seat.find({
        //         trainId: { $in: trains.map((train) => train._id) },
        //         journeyDate: journeyDateFilter
        //     })
        //         .sort({ updatedAt: -1 })
        //         .lean();

        //     inventories.forEach((inventory) => {
        //         const trainId = inventory.trainId.toString();

        //         // Keep the latest document if old data contains duplicates.
        //         if (!inventoryByTrainId.has(trainId)) {
        //             const availability = inventory.availability instanceof Map
        //                 ? Object.fromEntries(inventory.availability)
        //                 : inventory.availability || {};

        //             // Per-class waitlist counters (e.g. { EC: 3 }) so the
        //             // frontend can show "Waitlist: N" once a class sells out.
        //             const waitlist = inventory.waitlist instanceof Map
        //                 ? Object.fromEntries(inventory.waitlist)
        //                 : inventory.waitlist || {};

        //             inventoryByTrainId.set(trainId, {
        //                 journeyDate,
        //                 availability,
        //                 waitlist
        //             });
        //         }
        //     });
        // }

        const inventoryByTrainId = new Map();

        if (journeyDateFilter && trains.length) {

            const trainIds = trains.map(t => t._id);

            const coaches = await Coach.find({
                trainId: { $in: trainIds },
                journeyDate: journeyDateFilter
            }).lean();

            // Seat occupancy now lives in SeatReservation, not on the seat
            // itself — a seat can have several non-overlapping-segment
            // reservations at once. Fetch every currently-active one
            // (BOOKED, or HELD with an unexpired hold) across all these
            // trains in one query, then check overlap per seat below.
            const activeReservations = coaches.length > 0
                ? await SeatReservation.find({
                    trainId: { $in: trainIds },
                    journeyDate: journeyDateFilter,
                    $or: [
                        { status: "BOOKED" },
                        { status: "HELD", holdExpiresAt: { $gt: new Date() } }
                    ]
                }).lean()
                : [];

            const reservationsByTrainSeat = new Map();

            activeReservations.forEach((reservation) => {
                const key = `${reservation.trainId.toString()}|${reservation.seatCode}`;

                if (!reservationsByTrainSeat.has(key)) {
                    reservationsByTrainSeat.set(key, []);
                }

                reservationsByTrainSeat.get(key).push(reservation);
            });

            // Waitlist counters live on the legacy per-class Seat
            // inventory doc, not on Coach/SeatReservation — fetch them in
            // the same batch so "Waitlist: N" can still show on the
            // results card once a class sells out.
            const inventories = await Seat.find({
                trainId: { $in: trainIds },
                journeyDate: journeyDateFilter
            }).lean();

            const waitlistByTrainId = new Map();

            inventories.forEach((inventory) => {
                const key = inventory.trainId.toString();
                const waitlistMap = inventory.waitlist instanceof Map
                    ? Object.fromEntries(inventory.waitlist)
                    : (inventory.waitlist || {});

                waitlistByTrainId.set(key, waitlistMap);
            });

            for (const train of trains) {

                const availability = {};
                const waitlist = waitlistByTrainId.get(train._id.toString()) || {};

                const route = train.route || [];

                const searchFromIndex =
                    getStationIndex(route, from);

                const searchToIndex =
                    getStationIndex(route, to);

                const trainCoaches = coaches.filter(
                    coach =>
                        coach.trainId.toString() ===
                        train._id.toString()
                );

                for (const coach of trainCoaches) {

                    availability[coach.classCode] ??= 0;

                    for (const seat of coach.seats) {

                        const key = `${train._id.toString()}|${seat.seatCode}`;
                        const seatReservations = reservationsByTrainSeat.get(key) || [];

                        const overlapping = seatReservations.some((reservation) => {
                            const bookedFrom =
                                getStationIndex(route, reservation.fromStation);

                            const bookedTo =
                                getStationIndex(route, reservation.toStation);

                            return isJourneyOverlap(
                                searchFromIndex,
                                searchToIndex,
                                bookedFrom,
                                bookedTo
                            );
                        });

                        if (!overlapping) {
                            availability[coach.classCode]++;
                        }
                    }
                }

                inventoryByTrainId.set(
                    train._id.toString(),
                    {
                        journeyDate,
                        availability,
                        waitlist
                    }
                );
            }
        }

        const currentIndiaTime = getCurrentIndiaDateTime();
        const todayDepartureCutoff =
            journeyDate === currentIndiaTime.date
                ? currentIndiaTime.minutes
                : null;

        const formattedTrains = trains.map((train) => {
            const route = Array.isArray(train.route) ? train.route : [];
            const seatInventory =
                inventoryByTrainId.get(train._id.toString()) || null;

            const bookingOpen =
                seatInventory &&
                train.classes.some(cls =>
                    Object.prototype.hasOwnProperty.call(
                        seatInventory.availability,
                        cls.code
                    )
                );

            // Find the exact boarding / dropping stops for this query
            const boardingStation = route.find(
                (s) =>
                    s.stationCode?.toLowerCase() === from.toLowerCase() ||
                    s.stationName?.toLowerCase() === from.toLowerCase()
            ) || train.source || null;

            const droppingStation = route.find(
                (s) =>
                    s.stationCode?.toLowerCase() === to.toLowerCase() ||
                    s.stationName?.toLowerCase() === to.toLowerCase()
            ) || train.destination || null;

            return {
                ...train.toObject(),
                seatInventory,
                bookingOpen,
                bookingStatus: bookingOpen ? "OPEN" : "NOT_OPEN",
                // Expose resolved boarding/dropping stations
                boardingStation,
                droppingStation,

                // Top-level departure/arrival for the searched segment
                departureTime:
                    boardingStation?.departureTime ||
                    train.departureTime ||
                    train.source?.departureTime ||
                    null,

                arrivalTime:
                    droppingStation?.arrivalTime ||
                    train.arrivalTime ||
                    train.destination?.arrivalTime ||
                    null,
            };
        })
            .filter((train) => (
                todayDepartureCutoff === null ||
                getDepartureMinutes(train) > todayDepartureCutoff
            ))
            .sort(compareTrainsByDepartureTime);

        res.status(200).json({
            success: true,
            count: formattedTrains.length,
            trains: formattedTrains,
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getTrainById = async (req, res) => {
    try {
        const train = await Train.findById(req.params.id);

        if (!train) {
            return res.status(404).json({
                success: false,
                message: "Train not found"
            });
        }

        res.status(200).json({
            success: true,
            train
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getTrainSuggestions = async (req, res) => {
    try {
        const searchText = (req.query.q || "").trim();

        if (!searchText) {
            return res.json({
                trains: []
            });
        }

        const searchRegex = new RegExp(escapeRegex(searchText), "i");

        const trains = await Train.aggregate([
            {
                $addFields: {
                    priority: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $eq: [
                                            "$trainNumber",
                                            searchText
                                        ]
                                    },
                                    then: 1
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$trainNumber",
                                            regex: "^" + escapeRegex(searchText),
                                            options: "i"
                                        }
                                    },
                                    then: 2
                                },
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$name",
                                            regex: "^" + escapeRegex(searchText),
                                            options: "i"
                                        }
                                    },
                                    then: 3
                                }
                            ],
                            default: 4
                        }
                    }
                }
            },
            {
                $match: {
                    status: "ACTIVE",
                    $or: [
                        {
                            trainNumber: searchRegex
                        },
                        {
                            name: searchRegex
                        }
                    ]
                }
            },
            {
                $sort: {
                    priority: 1,
                    trainNumber: 1
                }
            },
            {
                $limit: 8
            },
            {
                $project: {
                    _id: 0,
                    number: "$trainNumber",
                    name: 1,
                    from: "$source.stationName",
                    to: "$destination.stationName"
                }
            }
        ]);

        res.json({
            trains
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * GET /api/trains/schedule?q=<trainNumber or trainName>
 *
 * Looks up a single train by exact train number, falling back to a
 * case-insensitive partial match on train number or name, then returns
 * the full document with a pre-computed, frontend-friendly schedule:
 * each stop gets its halt duration (in minutes) plus origin/destination
 * flags so the UI doesn't have to re-derive any of that.
 */
exports.getTrainSchedule = async (req, res) => {
    try {
        const searchText = (req.query.q || req.query.number || req.query.train || "").trim();

        if (!searchText) {
            return res.status(400).json({
                success: false,
                message: "Please provide a train number or train name to search."
            });
        }

        // 1. Exact train-number match takes priority (e.g. "12933")
        let train = await Train.findOne({
            trainNumber: searchText,
            status: "ACTIVE"
        });

        // 2. Fall back to a case-insensitive partial match on number or name
        if (!train) {
            const searchRegex = new RegExp(escapeRegex(searchText), "i");
            train = await Train.findOne({
                status: "ACTIVE",
                $or: [
                    { trainNumber: searchRegex },
                    { name: searchRegex }
                ]
            }).sort({ trainNumber: 1 });
        }

        if (!train) {
            return res.status(404).json({
                success: false,
                message: `No active train found matching "${searchText}".`
            });
        }

        const trainObj = train.toObject();
        const route = Array.isArray(trainObj.route) ? [...trainObj.route] : [];

        route.sort((a, b) => (a.stopNumber || 0) - (b.stopNumber || 0));

        const toMinutes = (time) => {
            if (!time) return null;
            const parts = time.split(":").map(Number);
            if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
            return parts[0] * 60 + parts[1];
        };

        const scheduleStops = route.map((stop, index) => {
            const arrMin = toMinutes(stop.arrivalTime);
            const depMin = toMinutes(stop.departureTime);

            let haltMinutes = null;
            if (arrMin !== null && depMin !== null) {
                haltMinutes = depMin - arrMin;
                if (haltMinutes < 0) haltMinutes += 24 * 60; // halt spans midnight
            }

            return {
                ...stop,
                haltMinutes,
                isOrigin: index === 0,
                isDestination: index === route.length - 1
            };
        });

        const totalHaltMinutes = scheduleStops.reduce(
            (sum, stop) => sum + (stop.haltMinutes || 0),
            0
        );

        res.status(200).json({
            success: true,
            train: {
                ...trainObj,
                route: scheduleStops,
                totalStops: scheduleStops.length,
                totalHaltMinutes
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

exports.getAllTrains = async (req, res) => {
    try {
        const trains = await Train.find({})
            .sort({ departureTime: 1, trainNumber: 1 });
        res.json({ trains });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/trains/:id
exports.getTrainById = async (req, res) => {
    try {
        const train = await Train.findById(req.params.id);

        if (!train) {
            return res.status(404).json({ message: "Train not found." });
        }

        res.json({ train });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /api/trains/:id
// Expects the same payload shape that createTrain accepts.
exports.updateTrain = async (req, res) => {
    try {
        const existing = await Train.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({ message: "Train not found." });
        }

        const { errors, train } = normalizeTrainPayload(req.body || {});

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Please fix the highlighted train details.",
                errors
            });
        }

        if (train.trainNumber !== existing.trainNumber) {
            const clash = await Train.exists({
                trainNumber: train.trainNumber,
                _id: { $ne: existing._id }
            });

            if (clash) {
                return res.status(409).json({ message: "Another train already uses this train number." });
            }
        }

        Object.assign(existing, train);
        const updatedTrain = await existing.save();

        AdminAuditLog.create({
            adminId: req.admin?._id,
            action: "TRAIN_UPDATED",
            ip: req.ip,
            userAgent: req.get("user-agent"),
            reason: `${updatedTrain.trainNumber} ${updatedTrain.name}`
        }).catch(() => { });

        res.json({ success: true, message: "Train updated successfully.", train: updatedTrain });
    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({ message: "Invalid train id." });
        }

        if (error.code === 11000) {
            return res.status(409).json({ message: "Another train already uses this train number." });
        }

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map((item) => item.message);
            return res.status(400).json({ message: "Validation failed.", errors });
        }

        res.status(500).json({ message: error.message });
    }
};

// DELETE /api/trains/:id
exports.deleteTrain = async (req, res) => {
    try {
        const deleted = await Train.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ message: "Train not found." });
        }

        res.json({ message: "Train deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getTrainDetails = exports.getTrainSchedule;
