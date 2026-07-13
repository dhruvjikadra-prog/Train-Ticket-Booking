const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ISSUER = "train-ticket-admin";

function getAccessSecret() {
    if (!process.env.JWT_ACCESS_SECRET) {
        throw new Error("JWT_ACCESS_SECRET is required for admin authentication.");
    }

    return process.env.JWT_ACCESS_SECRET;
}

function signAccessToken(admin) {
    return jwt.sign(
        { sub: admin._id.toString(), role: admin.role },
        getAccessSecret(),
        { expiresIn: ACCESS_TOKEN_TTL, issuer: ISSUER }
    );
}

function verifyAccessToken(token) {
    return jwt.verify(token, getAccessSecret(), { issuer: ISSUER });
}

function signPendingTwoFactorToken(adminId) {
    return jwt.sign(
        { sub: adminId.toString(), stage: "2fa-pending" },
        getAccessSecret(),
        { expiresIn: "5m", issuer: ISSUER }
    );
}

function verifyPendingTwoFactorToken(token) {
    const payload = jwt.verify(token, getAccessSecret(), { issuer: ISSUER });

    if (payload.stage !== "2fa-pending") {
        throw new Error("Unexpected token stage.");
    }

    return payload;
}

function generateRefreshToken() {
    const raw = crypto.randomBytes(48).toString("hex");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    return { raw, tokenHash, expiresAt };
}

function hashToken(raw) {
    return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
    signAccessToken,
    verifyAccessToken,
    signPendingTwoFactorToken,
    verifyPendingTwoFactorToken,
    generateRefreshToken,
    hashToken,
    REFRESH_TOKEN_TTL_MS,
    ISSUER
};
