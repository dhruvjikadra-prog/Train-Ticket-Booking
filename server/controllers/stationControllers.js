const Station = require("../models/Station");

const escapeRegex = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

exports.getStationSuggestions = async (req, res) => {
    try {
        const searchText = (req.query.q || "").trim();

        if (!searchText) {
            return res.json({
                stations: []
            });
        }

        const searchRegex = new RegExp(escapeRegex(searchText), "i");

        const stations = await Station.aggregate([
            {
                $addFields: {
                    priority: {
                        $switch: {
                            branches: [
                                // 1. Exact Station Code
                                {
                                    case: {
                                        $eq: [
                                            { $toUpper: "$code" },
                                            searchText.toUpperCase()
                                        ]
                                    },
                                    then: 1
                                },

                                // 2. Station Code Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$code",
                                            regex: "^" + escapeRegex(searchText),
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
                                            searchText.toLowerCase()
                                        ]
                                    },
                                    then: 3
                                },

                                // 4. Station Name Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$name",
                                            regex: "^" + escapeRegex(searchText),
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
                                            regex: escapeRegex(searchText),
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
                                            searchText.toLowerCase()
                                        ]
                                    },
                                    then: 6
                                },

                                // 7. City Starts With
                                {
                                    case: {
                                        $regexMatch: {
                                            input: "$city",
                                            regex: "^" + escapeRegex(searchText),
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
                                            regex: escapeRegex(searchText),
                                            options: "i"
                                        }
                                    },
                                    then: 8
                                }
                            ],
                            default: 9
                        }
                    }
                }
            },
            {
                $match: {
                    $or: [
                        { code: searchRegex },
                        { name: searchRegex },
                        { city: searchRegex },
                        { state: searchRegex },
                        { desc: searchRegex }
                    ]
                }
            },
            {
                $sort: {
                    priority: 1,
                    name: 1
                }
            },
            {
                $limit: 8
            }
        ]);

        res.json({
            stations
        });
    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
};
