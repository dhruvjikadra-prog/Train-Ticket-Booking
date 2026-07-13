const mongoose = require("mongoose");

/* ── SeatInventory schema ─────────────────────────────────── */
// One document per (train, journeyDate). Tracks real-time seat availability.
const seatInventorySchema = new mongoose.Schema(
    {
        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true
        },

        journeyDate: {
            type: Date,
            required: true
        },

        // availability: { SL: 500, CC: 200, "3A": 150 }
        availability: {
            type: Map,
            of: Number,
            default: {}
        },

        // bookedSeats: { SL: ["S1-1","S1-2"], CC: [], "3A": [] }
        bookedSeats: {
            type: Map,
            of: [String],
            default: {}
        },

        // waitlist counts: { SL: 0, CC: 0, "3A": 0 }
        waitlist: {
            type: Map,
            of: Number,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

/* ── Compound unique index: one doc per train + date ─────── */
seatInventorySchema.index({ trainId: 1, journeyDate: 1 }, { unique: true });

module.exports = mongoose.model("SeatInventory", seatInventorySchema);