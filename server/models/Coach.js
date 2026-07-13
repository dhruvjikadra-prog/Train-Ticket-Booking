const mongoose = require("mongoose");

const coachSeatSchema = new mongoose.Schema(
    {
        seatNumber: {
            type: Number,
            required: true,
            min: 1
        },
        seatCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        berthType: {
            type: String,
            required: true,
            enum: [
                "Lower",
                "Middle",
                "Upper",
                "Side Lower",
                "Side Middle",
                "Side Upper",
                "Window",
                "Aisle"
            ]
        },
        berthCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        row: {
            type: Number,
            required: true,
            min: 1
        },
        column: {
            type: Number,
            required: true,
            min: 1
        },
        side: {
            type: String,
            required: true,
            enum: ["LEFT", "RIGHT", "SIDE"]
        },
        status: {
            type: String,
            enum: ["AVAILABLE", "HELD", "BOOKED", "BLOCKED"],
            default: "AVAILABLE",
            index: true
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null
        },
        bookingToken: {
            type: String,
            default: null
        },
        fromStation: {
            type: String,
            uppercase: true,
            trim: true,
            default: null
        },
        toStation: {
            type: String,
            uppercase: true,
            trim: true,
            default: null
        },
        holdExpiresAt: {
            type: Date,
            default: null
        }
    },
    { _id: true }
);

const coachSchema = new mongoose.Schema(
    {
        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true,
            index: true
        },
        journeyDate: {
            type: Date,
            required: true,
            index: true
        },
        classCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        coachCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        coachType: {
            type: String,
            required: true
        },
        layoutType: {
            type: String,
            required: true
        },
        position: {
            type: Number,
            required: true,
            min: 1
        },
        capacity: {
            type: Number,
            required: true,
            min: 1
        },
        seats: {
            type: [coachSeatSchema],
            default: []
        }
    },
    { timestamps: true }
);

coachSchema.index(
    { trainId: 1, journeyDate: 1, classCode: 1, coachCode: 1 },
    { unique: true }
);
coachSchema.index({
    trainId: 1,
    journeyDate: 1,
    classCode: 1,
    "seats.seatCode": 1
});

module.exports = mongoose.model("Coach", coachSchema);