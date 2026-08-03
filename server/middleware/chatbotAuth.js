const jwt = require("jsonwebtoken");
const User = require("../models/Users");

const JWT_SECRET = process.env.JWT_SECRET || "Train_Booking_Secret";

/**
 * Optional auth for the chatbot endpoint.
 *
 * The chatbot has to work for both logged-in users (real PNR/booking/payment
 * lookups) and guests (general help, static answers) — so unlike a normal
 * "protect" middleware, this NEVER blocks the request. If the token is
 * missing or invalid, it just proceeds with req.user left unset, and the
 * controller responds with a "please log in" message for anything that
 * needs account data.
 *
 * This must use the same JWT secret and user lookup as the normal user auth
 * middleware. Otherwise a valid logged-in browser session can be treated as a
 * guest by the chatbot.
 */
const optionalAuth = async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token || token === "null" || token === "undefined") {
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id || decoded._id || decoded.userId;

        if (!userId) {
            req.user = null;
            return next();
        }

        const user = await User.findById(userId).select("_id name email role").lean();

        if (!user) {
            req.user = null;
            return next();
        }

        req.user = {
            id: user._id.toString(),
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role || "user"
        };
    } catch (error) {
        // Expired/invalid token: treat as guest instead of failing the request.
        req.user = null;
    }

    return next();
};

module.exports = { optionalAuth };
