const rateLimit = require("express-rate-limit");

/**
 * Rate limiter dedicated to the chatbot endpoint (separate from your
 * existing pnrStatusLimiter — this one also throttles booking/payment
 * lookups and general chat, not just PNR search).
 *
 * Logged-in users get a higher allowance since they're already
 * identifiable by account, not just IP; guests are capped harder because
 * an anonymous PNR-guessing script is the main abuse case here.
 *
 * Must run AFTER optionalAuth so req.user is available when computing
 * the key/limit.
 */
const chatbotRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: (req) => (req.user?.id ? 30 : 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
    handler: (req, res) => {
        return res.status(429).json({
            reply: "You're sending messages a bit too fast. Please wait a moment and try again.",
            mode: "rate_limited"
        });
    }
});

module.exports = { chatbotRateLimiter };