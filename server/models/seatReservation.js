const mongoose = require("mongoose");

// One document per *active* reservation of a seat for a specific
// fromStation -> toStation segment. This is what actually replaces the old
// "one status field per seat" model: the same seatCode can have several of
// these documents at once, as long as their station ranges don't overlap
// (e.g. ST->BH and BH->BRC on the same seat, same journeyDate).
//
// Lifecycle: created with status "HELD" (holdExpiresAt ~15 min out) when a
// passenger selects a seat, flipped to "BOOKED" (holdExpiresAt cleared)
// when payment succeeds, and deleted outright the moment it's no longer
// occupying the seat (hold expired/released, or booking cancelled). There
// is deliberately no "AVAILABLE" or "CANCELLED" status here — the absence
// of a document for a given seat+segment *is* "available".
const seatReservationSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true
        },
        bookingToken: {
            type: String,
            required: true,
            index: true
        },

        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true
        },
        journeyDate: {
            type: Date,
            required: true
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
        seatCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        seatNumber: {
            type: Number,
            required: true
        },

        // The specific segment this particular reservation occupies.
        // Two documents on the same seatCode are only in conflict if these
        // ranges actually overlap (checked in application code against the
        // train's route order — station codes alone don't imply order).
        fromStation: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        toStation: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        status: {
            type: String,
            enum: ["HELD", "BOOKED"],
            required: true,
            default: "HELD",
            index: true
        },

        // Only meaningful while status is HELD. A HELD document past this
        // time is treated as inactive everywhere (and swept up by
        // releaseExpiredHolds), even before it's actually deleted.
        holdExpiresAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// The core query every hold/claim/availability check runs: "what active
// reservations exist for this seat, on this train/date/class".
seatReservationSchema.index({
    trainId: 1,
    journeyDate: 1,
    classCode: 1,
    seatCode: 1
});

module.exports = mongoose.models.SeatReservation || mongoose.model("SeatReservation", seatReservationSchema);
