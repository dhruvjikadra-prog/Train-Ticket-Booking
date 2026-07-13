const mongoose = require("mongoose");

/* ── Individual seat sub-schema ───────────────────────────── */
const seatSchema = new mongoose.Schema(
    {
        seatNumber: {
            type: String,
            required: true,
            trim: true
        },

        berthType: {
            type: String,
            required: true,
            enum: ["Lower", "Middle", "Upper", "Side Lower", "Side Upper"]
        },

        row: {
            type: Number,
            required: true
        },

        column: {
            type: Number,
            required: true
        }
    },
    { _id: false }
);

/* ── SeatMap schema ───────────────────────────────────────── */
// One document per (train, class, coach). Layout of physical seats.
const seatMapSchema = new mongoose.Schema(
    {
        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true
        },

        classCode: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        coachNumber: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        seats: {
            type: [seatSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

/* ── Indexes ─────────────────────────────────────────────── */
seatMapSchema.index({ trainId: 1, classCode: 1, coachNumber: 1 }, { unique: true });
seatMapSchema.index({ trainId: 1, classCode: 1 });

module.exports = mongoose.model("SeatMap", seatMapSchema);