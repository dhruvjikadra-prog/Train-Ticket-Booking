const mongoose = require("mongoose");

/* Route Station Schema */
const routeStationSchema = new mongoose.Schema(
    {
        stationCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

    stationName: {
        type: String,
        required: true,
        trim: true
    },

    arrivalTime: {
        type: String,
        default: null
    },

    departureTime: {
        type: String,
        default: null
    },

    distance: {
        type: Number,
        default: 0
    },

    day: {
        type: Number,
        default: 1
    },

    stopNumber: {
        type: Number,
        required: true
    }
},
{
    _id: false
}

);

/* Train Class Schema */
const classSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true
        },

    name: {
        type: String,
        required: true,
        trim: true
    },

    farePerKm: {
        type: Number,
        required: true,
        min: 0
    },

    totalSeats: {
        type: Number,
        required: true,
        min: 0
    }
},
{
    _id: false
}

);

/* Main Train Schema */
const trainSchema = new mongoose.Schema(
    {
        trainNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

    name: {
        type: String,
        required: true,
        trim: true
    },

    trainType: {
        type: String,
        default: "Express"
    },

    source: {
        stationCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        stationName: {
            type: String,
            required: true,
            trim: true
        }
    },

    destination: {
        stationCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        stationName: {
            type: String,
            required: true,
            trim: true
        }
    },

    route: {
        type: [routeStationSchema],
        default: []
    },

    departureTime: {
        type: String,
        required: true
    },

    arrivalTime: {
        type: String,
        required: true
    },

    duration: {
        type: String,
        required: true
    },

    distance: {
        type: Number,
        required: true
    },

    averageSpeed: {
        type: Number,
        default: 0
    },

    runningDays: {
        type: [String],
        default: []
    },

    classes: {
        type: [classSchema],
        default: []
    },

    facilities: {
        pantry: {
            type: Boolean,
            default: false
        },

        wifi: {
            type: Boolean,
            default: false
        },

        chargingPoint: {
            type: Boolean,
            default: false
        },

        blanket: {
            type: Boolean,
            default: false
        },

        cctv: {
            type: Boolean,
            default: false
        }
    },

    rating: {
        type: Number,
        default: 4.2,
        min: 0,
        max: 5
    },

    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE"],
        default: "ACTIVE"
    }
},
{
    timestamps: true
}

);

/* Search Indexes */
trainSchema.index({
    trainNumber: "text",
    name: "text",
    "source.stationName": "text",
    "destination.stationName": "text",
    "route.stationName": "text",
    "route.stationCode": "text"
});

module.exports = mongoose.model("Train", trainSchema);
