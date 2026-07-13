const crypto = require("crypto");

const CSRF_COOKIE = "ttb_csrf";
const isProd = process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE || (isProd ? "none" : "strict");
const cookieSecure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd || cookieSameSite === "none";

function issueCsrfToken(req, res) {
    const token = crypto.randomBytes(24).toString("hex");

    res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/",
        maxAge: 60 * 60 * 1000
    });

    return token;
}

function verifyCsrf(req, res, next) {
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers["x-csrf-token"];

    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
        return res.status(403).json({
            message: "Invalid or missing security token. Refresh the page and try again."
        });
    }

    const isMatch = crypto.timingSafeEqual(
        Buffer.from(cookieToken),
        Buffer.from(headerToken)
    );

    if (!isMatch) {
        return res.status(403).json({
            message: "Invalid or missing security token. Refresh the page and try again."
        });
    }

    next();
}

module.exports = { issueCsrfToken, verifyCsrf, CSRF_COOKIE };
