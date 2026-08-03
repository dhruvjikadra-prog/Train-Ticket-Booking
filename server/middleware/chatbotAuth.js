const jwt = require("jsonwebtoken");

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
 * IMPORTANT: adjust `decoded.id / decoded._id / decoded.userId` below to
 * match whatever field name your existing login flow actually signs into
 * the JWT payload.
 */
const optionalAuth = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = {
            id: decoded.id || decoded._id || decoded.userId,
            role: decoded.role || null
        };
    } catch (error) {
        // Expired/invalid token: treat as guest instead of failing the request.
        req.user = null;
    }

    return next();
};

module.exports = { optionalAuth };