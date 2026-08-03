// Lightweight rule-based NLU for the RailGo chatbot.
//
// This is intentionally NOT a full ML/LLM pipeline — it's a scored keyword
// matcher (intent) plus regex extraction (entities). This is what lets the
// chatbot go from "static reply list" to "understands what the user wants
// AND which specific PNR/booking they mean", so the controller can go fetch
// the real record instead of returning a canned sentence.

// Mongo ObjectId, e.g. from a booking permalink or internal reference.
const OBJECT_ID_REGEX = /\b[a-f0-9]{24}\b/i;

// RailGo booking tokens — adjust the prefix list if your bookingToken format
// differs (currently assumes something like "RG-AB12CD34").
const BOOKING_TOKEN_REGEX = /\b(?:RG|BKG|BOOK)[-_]?[A-Z0-9]{6,}\b/i;

// PNR numbers are numeric. We accept 8-12 digits to be tolerant of format
// changes, but a 10-digit PNR (IRCTC-style) will always match first because
// it's the most common length seen in normal conversation.
const PNR_REGEX = /\b\d{8,12}\b/;

// Each intent is a list of keywords/phrases. Multi-word phrases score higher
// than single words so "payment failed" outranks a bare "payment" match,
// reducing false positives between similar intents (e.g. booking vs payment).
const INTENTS = [
    {
        name: "pnr_status",
        weight: 3,
        keywords: ["pnr", "pnr status", "check pnr", "ticket status", "journey status"]
    },
    {
        name: "cancel_booking",
        weight: 3,
        keywords: ["cancel", "cancellation", "cancel ticket", "cancel booking", "cancel it", "cancel this"]
    },
    {
        name: "payment_status",
        weight: 2,
        keywords: ["payment", "paid", "payment failed", "transaction", "money debited", "refund", "refund status"]
    },
    {
        name: "booking_status",
        weight: 2,
        keywords: ["booking status", "my booking", "my ticket", "booking detail", "latest booking", "recent booking", "booking details"]
    },
    {
        name: "booking_help",
        weight: 1,
        keywords: ["book", "booking", "reserve", "reservation", "how to book", "book ticket"]
    },
    {
        name: "train_search",
        weight: 1,
        keywords: ["train", "schedule", "route", "timing", "time table", "train number"]
    },
    {
        name: "seat_availability",
        weight: 1,
        keywords: ["seat", "coach", "class", "availability", "seat availability"]
    },
    {
        name: "account_help",
        weight: 1,
        keywords: ["login", "signup", "sign up", "account", "profile", "password"]
    },
    {
        name: "greeting",
        weight: 1,
        keywords: ["hi", "hello", "hey", "good morning", "good evening", "namaste"]
    }
];

const normalize = (message) => String(message || "").trim().toLowerCase();

/**
 * Pull structured entities (PNR / booking token / Mongo id) out of the raw
 * message text. Order of extraction matters: we look for the more specific
 * patterns (ObjectId, booking token) before falling back to a bare numeric
 * PNR, so a booking token containing digits doesn't get mis-read as a PNR.
 */
const extractEntities = (rawMessage) => {
    const message = String(rawMessage || "");

    const objectId = message.match(OBJECT_ID_REGEX)?.[0] || null;
    const bookingToken = message.match(BOOKING_TOKEN_REGEX)?.[0] || null;
    const pnrNumber = !bookingToken ? message.match(PNR_REGEX)?.[0] || null : null;

    return { objectId, bookingToken, pnrNumber };
};

/**
 * Score every intent against the message and return the best match.
 * Falls back to "fallback" when nothing scores above zero, which the
 * controller maps to the generic help message.
 */
const detectIntent = (rawMessage) => {
    const message = normalize(rawMessage);
    let best = { name: "fallback", score: 0 };

    for (const intent of INTENTS) {
        let score = 0;

        for (const keyword of intent.keywords) {
            if (message.includes(keyword)) {
                // Reward longer/more specific phrase matches over single-word ones.
                score += intent.weight + (keyword.split(" ").length - 1);
            }
        }

        if (score > best.score) {
            best = { name: intent.name, score };
        }
    }

    return best.name;
};

module.exports = { detectIntent, extractEntities, normalize, INTENTS };