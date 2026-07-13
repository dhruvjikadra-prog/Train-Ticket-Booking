const mongoose = require("mongoose");

const stationSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true
        },

        name: {
            type: String,
            required: true
        },

        lat: {
            type: Number,
            required: true
        },

        lng: {
            type: Number,
            required: true
        },

        arrival: {
            type: String,
            default: ""
        },

        departure: {
            type: String,
            default: ""
        },

        distance: {
            type: Number,
            default: 0
        },

        day: {
            type: Number,
            default: 1
        }
    },
    {
        _id: false
    }
);

const trainRouteMapSchema = new mongoose.Schema(
    {
        trainNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        trainName: {
            type: String,
            required: true,
            trim: true
        },

        stations: {
            type: [stationSchema],
            default: []
        },

        polyline: {
            type: [[Number]],
            default: []
        },

        bounds: {
            southWest: {
                type: [Number],
                default: []
            },

            northEast: {
                type: [Number],
                default: []
            }
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("TrainRouteMap", trainRouteMapSchema);