const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const { ipKeyGenerator } = require("express-rate-limit");

const ipKey = (req) => ipKeyGenerator(req.ip);
const emailKey = (req) => String(req.body?.email || "").trim().toLowerCase() || "unknown";
const userKey = (req) => req.user?.id || req.user?._id?.toString?.() || "anonymous";

const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `${ipKey(req)}:${emailKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts from this network. Please try again later." }
});

const loginSlowDown = slowDown({
    windowMs: 10 * 60 * 1000,
    delayAfter: 3,
    delayMs: (used, req) => {
        const delayAfter = req.slowDown?.limit || 3;
        return Math.max(0, used - delayAfter) * 500;
    },
    maxDelayMs: 5000
});

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => `${ipKey(req)}:${emailKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many account creation attempts. Please try again later." }
});

const authenticatedLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 180,
    keyGenerator: (req) => `${userKey(req)}:${ipKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests for this account. Please slow down." }
});

const bookingWriteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 40,
    keyGenerator: (req) => `${userKey(req)}:${ipKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many booking actions. Please wait before trying again." }
});

const paymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => `${userKey(req)}:${ipKey(req)}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many payment attempts. Please try again later." }
});

module.exports = {
    loginLimiter,
    loginSlowDown,
    signupLimiter,
    globalLimiter,
    authenticatedLimiter,
    bookingWriteLimiter,
    paymentLimiter
};
