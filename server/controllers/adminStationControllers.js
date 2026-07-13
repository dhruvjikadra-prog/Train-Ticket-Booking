const mongoose = require("mongoose");
const Station = require("../models/Station");
const Train = require("../models/Train");

const MAX_PAGE_SIZE = 100;

const STATUSES = new Set(["ACTIVE", "INACTIVE"]);

// A real-world station code is 2-10 uppercase letters (e.g. "ST", "BCT",
// "NDLS") — no digits/punctuation, matching how codes are used everywhere
// else in this app (Train.route[].stationCode, Booking.fromStation, etc).
const CODE_PATTERN = /^[A-Z]{2,10}$/;

// Name/city/state: letters, spaces, and a small set of punctuation actually
// seen in Indian place names (Bandra (T.), Vadodara, New Delhi, etc).
const PLACE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s.'-]*$/;

const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Validates the create/update payload. Returns { errors, cleaned } where
 * `errors` is a field->message map (empty when valid) and `cleaned` is the
 * trimmed/normalized version of each field, ready to save.
 */
const validateStationPayload = (body, { partial = false } = {}) => {
    const errors = {};
    const cleaned = {};

    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasCode = Object.prototype.hasOwnProperty.call(body, "code");
    const hasCity = Object.prototype.hasOwnProperty.call(body, "city");
    const hasState = Object.prototype.hasOwnProperty.call(body, "state");
    const hasDesc = Object.prototype.hasOwnProperty.call(body, "desc");
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");

    if (!partial || hasName) {
        const name = String(body.name || "").trim();
        if (!name) {
            errors.name = "Station name is required.";
        } else if (name.length < 2 || name.length > 100 || !PLACE_NAME_PATTERN.test(name)) {
            errors.name = "Enter a valid station name (letters only).";
        } else {
            cleaned.name = name;
        }
    }

    if (!partial || hasCode) {
        const code = String(body.code || "").trim().toUpperCase();
        if (!code) {
            errors.code = "Station code is required.";
        } else if (!CODE_PATTERN.test(code)) {
            errors.code = "Station code must be 2-10 uppercase letters (e.g. NDLS).";
        } else {
            cleaned.code = code;
        }
    }

    if (!partial || hasCity) {
        const city = String(body.city || "").trim();
        if (!city) {
            errors.city = "City is required.";
        } else if (city.length < 2 || city.length > 100 || !PLACE_NAME_PATTERN.test(city)) {
            errors.city = "Enter a valid city name.";
        } else {
            cleaned.city = city;
        }
    }

    if (!partial || hasState) {
        const state = String(body.state || "").trim();
        if (!state) {
            errors.state = "State is required.";
        } else if (state.length < 2 || state.length > 100 || !PLACE_NAME_PATTERN.test(state)) {
            errors.state = "Enter a valid state name.";
        } else {
            cleaned.state = state;
        }
    }

    if (hasDesc) {
        const desc = String(body.desc || "").trim();
        if (desc.length > 500) {
            errors.desc = "Description must be under 500 characters.";
        } else {
            cleaned.desc = desc;
        }
    }

    if (hasStatus) {
        const status = String(body.status || "").trim().toUpperCase();
        if (!STATUSES.has(status)) {
            errors.status = "Status must be ACTIVE or INACTIVE.";
        } else {
            cleaned.status = status;
        }
    }

    return { errors, cleaned };
};

const formatStation = (station) => ({
    id: station._id,
    name: station.name,
    code: station.code,
    city: station.city,
    state: station.state,
    desc: station.desc || "",
    status: station.status,
    createdAt: station.createdAt,
    updatedAt: station.updatedAt
});

/**
 * GET /api/admin/stations
 * Paginated, searchable, filterable station list.
 */
const getStations = async (req, res) => {
    try {
        const page = toInt(req.query.page, 1);
        const limit = Math.min(toInt(req.query.limit, 20), MAX_PAGE_SIZE);
        const skip = (page - 1) * limit;

        const term = String(req.query.search || "").trim();
        const status = req.query.status
            ? String(req.query.status).toUpperCase()
            : null;

        const match = {};

        if (status && STATUSES.has(status)) {
            match.status = status;
        }

        if (term) {
            const regex = new RegExp(escapeRegex(term), "i");

            match.$or = [
                { code: regex },
                { name: regex },
                { city: regex },
                { state: regex },
                { desc: regex }
            ];
        }

        const pipeline = [
            { $match: match }
        ];

        if (term) {
            pipeline.push({
                $addFields: {
                    priority: {
                        $switch: {
                            branches: [
                                // 1. Exact Station Code
                                {
                                    case: {
                                        $eq: [
                                            { $toUpper: "$code" },
                                            term.toUpperCase()
                                        ]
                                    },
                                    then: 1
                                },

                                // 2. Station Code Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$code",
                                            regex: "^" + escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 2
                                },

                                // 3. Exact Station Name
                                {
                                    case: {
                                        $eq: [
                                            { $toLower: "$name" },
                                            term.toLowerCase()
                                        ]
                                    },
                                    then: 3
                                },

                                // 4. Station Name Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$name",
                                            regex: "^" + escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 4
                                },

                                // 5. Station Name Contains
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$name",
                                            regex: escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 5
                                },

                                // 6. Exact City
                                {
                                    case: {
                                        $eq: [
                                            { $toLower: "$city" },
                                            term.toLowerCase()
                                        ]
                                    },
                                    then: 6
                                },

                                // 7. City Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$city",
                                            regex: "^" + escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 7
                                },

                                // 8. City Contains
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$city",
                                            regex: escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 8
                                },

                                // 9. State Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$state",
                                            regex: "^" + escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 9
                                },

                                // 10. State Contains
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$state",
                                            regex: escapeRegex(term),
                                            options: "i"
                                        }
                                    },
                                    then: 10
                                }
                            ],
                            default: 99
                        }
                    }
                }
            });

            pipeline.push({
                $sort: {
                    priority: 1,
                    name: 1
                }
            });
        } else {
            pipeline.push({
                $sort: {
                    name: 1
                }
            });
        }

        const countPipeline = [
            { $match: match },
            { $count: "total" }
        ];

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const [stations, totalResult] = await Promise.all([
            Station.aggregate(pipeline),
            Station.aggregate(countPipeline)
        ]);

        const total = totalResult.length ? totalResult[0].total : 0;

        res.json({
            stations: stations.map(formatStation),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        });

    } catch (error) {
        res.status(500).json({
            message: "Unable to load stations right now.",
            error: error.message
        });
    }
};

/**
 * GET /api/admin/stations/:id
 */
const getStationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid station id." });
        }

        const station = await Station.findById(id).lean();

        if (!station) {
            return res.status(404).json({ message: "Station not found." });
        }

        res.json({ station: formatStation(station) });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load this station.",
            error: error.message
        });
    }
};

/**
 * POST /api/admin/stations
 */
const createStation = async (req, res) => {
    try {
        const { errors, cleaned } = validateStationPayload(req.body);

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
        }

        const existing = await Station.findOne({ code: cleaned.code }).lean();
        if (existing) {
            return res.status(409).json({
                message: `Station code "${cleaned.code}" is already in use.`,
                errors: { code: "This station code is already in use." }
            });
        }

        const station = await Station.create({
            name: cleaned.name,
            code: cleaned.code,
            city: cleaned.city,
            state: cleaned.state,
            desc: cleaned.desc || "",
            status: cleaned.status || "ACTIVE"
        });

        res.status(201).json({
            message: "Station created successfully.",
            station: formatStation(station)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This station code is already in use.",
                errors: { code: "This station code is already in use." }
            });
        }

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        res.status(500).json({
            message: "Unable to create this station right now.",
            error: error.message
        });
    }
};

/**
 * PUT /api/admin/stations/:id
 */
const updateStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid station id." });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({ message: "Station not found." });
        }

        const { errors, cleaned } = validateStationPayload(req.body, { partial: true });

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
        }

        if (cleaned.code && cleaned.code !== station.code) {
            const existing = await Station.findOne({
                code: cleaned.code,
                _id: { $ne: station._id }
            }).lean();

            if (existing) {
                return res.status(409).json({
                    message: `Station code "${cleaned.code}" is already in use.`,
                    errors: { code: "This station code is already in use." }
                });
            }
        }

        Object.assign(station, cleaned);
        await station.save();

        res.json({
            message: "Station updated successfully.",
            station: formatStation(station)
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This station code is already in use.",
                errors: { code: "This station code is already in use." }
            });
        }

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        res.status(500).json({
            message: "Unable to update this station right now.",
            error: error.message
        });
    }
};

/**
 * PATCH /api/admin/stations/:id/status
 * Quick ACTIVE/INACTIVE toggle — the safer alternative to deleting a
 * station that's already in use somewhere, without a full edit form.
 */
const setStationStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid station id." });
        }

        const status = String(req.body.status || "").trim().toUpperCase();

        if (!STATUSES.has(status)) {
            return res.status(400).json({ message: "Status must be ACTIVE or INACTIVE." });
        }

        const station = await Station.findByIdAndUpdate(
            id,
            { $set: { status } },
            { new: true }
        );

        if (!station) {
            return res.status(404).json({ message: "Station not found." });
        }

        res.json({
            message: `Station marked ${status}.`,
            station: formatStation(station)
        });
    } catch (error) {
        res.status(500).json({
            message: "Unable to update this station's status right now.",
            error: error.message
        });
    }
};

/**
 * DELETE /api/admin/stations/:id
 * Refuses to delete a station that any train's route still references —
 * Train.route[].stationCode is a plain string, not a foreign key, so Mongo
 * won't stop this on its own. Deactivating (status: INACTIVE) is offered
 * as the safe alternative instead of silently orphaning route data.
 */
const deleteStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid station id." });
        }

        const station = await Station.findById(id).lean();

        if (!station) {
            return res.status(404).json({ message: "Station not found." });
        }

        const trainsUsingStation = await Train.countDocuments({
            "route.stationCode": station.code
        });

        if (trainsUsingStation > 0) {
            return res.status(409).json({
                message:
                    `"${station.name}" (${station.code}) is used in the route of ${trainsUsingStation} train(s) and can't be deleted. ` +
                    "Remove it from those routes first, or mark it Inactive instead.",
                trainsUsingStation
            });
        }

        await Station.deleteOne({ _id: station._id });

        res.json({ message: "Station deleted successfully." });
    } catch (error) {
        res.status(500).json({
            message: "Unable to delete this station right now.",
            error: error.message
        });
    }
};

module.exports = {
    getStations,
    getStationById,
    createStation,
    updateStation,
    setStationStatus,
    deleteStation
};