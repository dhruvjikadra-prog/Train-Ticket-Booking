const bcrypt = require("bcryptjs");

const Admin = require("../models/Admin");
const AdminAuditLog = require("../models/AdminAuditLog");
const {
    signAccessToken,
    signPendingTwoFactorToken,
    verifyPendingTwoFactorToken,
    generateRefreshToken,
    hashToken,
    REFRESH_TOKEN_TTL_MS
} = require("../utils/tokens");
const { verifyOtpToken } = require("../utils/otp");
const { createMathCaptcha, verifyMathCaptcha } = require("../utils/captcha");
const { issueCsrfToken } = require("../middleware/csrf");
const sendSecurityAlert = require("../utils/sendSecurityAlert");
const { ACCESS_COOKIE } = require("../middleware/adminAuthMiddleware");

const REFRESH_COOKIE = "ttb_admin_rt";
const PENDING_2FA_COOKIE = "ttb_admin_2fa_pending";
const REFRESH_COOKIE_PATH = "/api/admin/auth";

const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const DUMMY_HASH = "$2a$12$C6UmZ2gEzqUm2EgUe1Hq4eYpzS6N0E1bYJk4l3oWv1y8GZ9q2QovW";
const isProd = process.env.NODE_ENV === "production";
const cookieSameSite = process.env.COOKIE_SAME_SITE || (isProd ? "none" : "strict");
const cookieSecure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd || cookieSameSite === "none";

const cookieBase = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite
};

function logAudit({ adminId, emailAttempted, action, ip, userAgent, reason }) {
    AdminAuditLog.create({ adminId, emailAttempted, action, ip, userAgent, reason }).catch(() => {});
}

function publicAdmin(admin) {
    return {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        twoFactorEnabled: admin.twoFactorEnabled,
        lastLoginAt: admin.lastLoginAt
    };
}

async function issueSession(admin, req, res) {
    const ip = req.ip;
    const userAgent = req.get("user-agent") || "unknown";
    const accessToken = signAccessToken(admin);
    const { raw, tokenHash, expiresAt } = generateRefreshToken();

    admin.refreshSessions = admin.refreshSessions.filter((session) => session.expiresAt > new Date());
    admin.refreshSessions.push({ tokenHash, ip, userAgent, expiresAt });
    admin.lastLoginAt = new Date();
    admin.lastLoginIp = ip;

    await admin.save();

    res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
    res.cookie(REFRESH_COOKIE, raw, {
        ...cookieBase,
        maxAge: REFRESH_TOKEN_TTL_MS,
        path: REFRESH_COOKIE_PATH
    });
}

exports.getCsrfToken = (req, res) => {
    const token = issueCsrfToken(req, res);
    res.json({ csrfToken: token });
};

exports.getCaptcha = (req, res, next) => {
    try {
        const { question, token } = createMathCaptcha();
        res.json({ question, token });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res) => {
    const ip = req.ip;
    const userAgent = req.get("user-agent") || "unknown";
    const { email, password, captchaToken, captchaAnswer } = req.body;
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const genericFail = (status = 401) => res.status(status).json({ message: "Invalid email or password." });

    try {
        if (!verifyMathCaptcha(captchaToken, captchaAnswer)) {
            logAudit({ emailAttempted: normalizedEmail, action: "LOGIN_FAILED", ip, userAgent, reason: "Bad captcha" });
            return res.status(400).json({ message: "Verification failed. Refresh the page and try again." });
        }

        const admin = await Admin.findOne({ email: normalizedEmail }).select("+passwordHash +twoFactorSecret");

        if (!admin) {
            await bcrypt.compare(String(password || ""), DUMMY_HASH);
            logAudit({ emailAttempted: normalizedEmail, action: "LOGIN_FAILED", ip, userAgent, reason: "No such account" });
            return genericFail();
        }

        if (admin.lockUntil && admin.lockUntil.getTime() > Date.now()) {
            const retryAfterSeconds = Math.ceil((admin.lockUntil.getTime() - Date.now()) / 1000);
            logAudit({ adminId: admin._id, action: "LOGIN_FAILED", ip, userAgent, reason: "Account locked" });

            return res.status(423).json({
                message: "Account temporarily locked after repeated failed attempts.",
                retryAfterSeconds
            });
        }

        if (!admin.isActive) {
            logAudit({ adminId: admin._id, action: "LOGIN_FAILED", ip, userAgent, reason: "Inactive account" });
            return genericFail(403);
        }

        const passwordMatches = await bcrypt.compare(String(password || ""), admin.passwordHash);

        if (!passwordMatches) {
            admin.failedLoginAttempts += 1;

            if (admin.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
                const multiplier = Math.floor(admin.failedLoginAttempts / MAX_FAILED_ATTEMPTS);
                admin.lockUntil = new Date(Date.now() + BASE_LOCK_MS * multiplier);

                logAudit({
                    adminId: admin._id,
                    action: "ACCOUNT_LOCKED",
                    ip,
                    userAgent,
                    reason: `${admin.failedLoginAttempts} consecutive failed attempts`
                });

                sendSecurityAlert({
                    admin,
                    ip,
                    userAgent,
                    reason: "Account locked after repeated failed logins"
                });
            }

            await admin.save();
            logAudit({ adminId: admin._id, action: "LOGIN_FAILED", ip, userAgent, reason: "Wrong password" });
            return genericFail();
        }

        admin.failedLoginAttempts = 0;
        admin.lockUntil = null;

        if (admin.twoFactorEnabled) {
            await admin.save();

            const pendingToken = signPendingTwoFactorToken(admin._id);
            res.cookie(PENDING_2FA_COOKIE, pendingToken, { ...cookieBase, maxAge: 5 * 60 * 1000 });

            logAudit({ adminId: admin._id, action: "LOGIN_SUCCESS", ip, userAgent, reason: "Password OK, awaiting 2FA" });
            return res.json({ twoFactorRequired: true });
        }

        await issueSession(admin, req, res);
        logAudit({ adminId: admin._id, action: "LOGIN_SUCCESS", ip, userAgent, reason: "No 2FA configured" });
        return res.json({ twoFactorRequired: false, admin: publicAdmin(admin) });
    } catch {
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

exports.verifyOtp = async (req, res) => {
    const ip = req.ip;
    const userAgent = req.get("user-agent") || "unknown";
    const { otp } = req.body;
    const pendingToken = req.cookies?.[PENDING_2FA_COOKIE];

    if (!pendingToken) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    try {
        const payload = verifyPendingTwoFactorToken(pendingToken);
        const admin = await Admin.findById(payload.sub).select("+twoFactorSecret");

        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        if (!verifyOtpToken(otp, admin.twoFactorSecret)) {
            logAudit({ adminId: admin._id, action: "OTP_FAILED", ip, userAgent });
            return res.status(401).json({ message: "Invalid verification code." });
        }

        res.clearCookie(PENDING_2FA_COOKIE, cookieBase);
        await issueSession(admin, req, res);

        logAudit({ adminId: admin._id, action: "OTP_SUCCESS", ip, userAgent });
        return res.json({ message: "Login successful.", admin: publicAdmin(admin) });
    } catch {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }
};

exports.refresh = async (req, res) => {
    const ip = req.ip;
    const userAgent = req.get("user-agent") || "unknown";
    const raw = req.cookies?.[REFRESH_COOKIE];

    if (!raw) {
        return res.status(401).json({ message: "Not authenticated." });
    }

    const tokenHash = hashToken(raw);
    const admin = await Admin.findOne({ "refreshSessions.tokenHash": tokenHash });

    if (!admin) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    const session = admin.refreshSessions.find((item) => item.tokenHash === tokenHash);

    if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }

    admin.refreshSessions = admin.refreshSessions.filter((item) => item.tokenHash !== tokenHash);

    const accessToken = signAccessToken(admin);
    const { raw: newRaw, tokenHash: newHash, expiresAt } = generateRefreshToken();
    admin.refreshSessions.push({ tokenHash: newHash, ip, userAgent, expiresAt });
    await admin.save();

    res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
    res.cookie(REFRESH_COOKIE, newRaw, {
        ...cookieBase,
        maxAge: REFRESH_TOKEN_TTL_MS,
        path: REFRESH_COOKIE_PATH
    });

    logAudit({ adminId: admin._id, action: "TOKEN_REFRESHED", ip, userAgent });
    res.json({ message: "Session refreshed." });
};

exports.logout = async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];

    if (raw && req.admin) {
        const tokenHash = hashToken(raw);
        req.admin.refreshSessions = req.admin.refreshSessions.filter((session) => session.tokenHash !== tokenHash);
        await req.admin.save();
        logAudit({ adminId: req.admin._id, action: "LOGOUT", ip: req.ip, userAgent: req.get("user-agent") });
    }

    res.clearCookie(ACCESS_COOKIE, cookieBase);
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: REFRESH_COOKIE_PATH });
    res.json({ message: "Logged out." });
};

exports.logoutAllSessions = async (req, res) => {
    req.admin.refreshSessions = [];
    await req.admin.save();
    logAudit({
        adminId: req.admin._id,
        action: "LOGOUT",
        ip: req.ip,
        userAgent: req.get("user-agent"),
        reason: "All sessions revoked"
    });

    res.clearCookie(ACCESS_COOKIE, cookieBase);
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: REFRESH_COOKIE_PATH });
    res.json({ message: "Logged out everywhere." });
};

exports.me = (req, res) => {
    res.json({ admin: publicAdmin(req.admin) });
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select("+passwordHash");

    const matches = await bcrypt.compare(currentPassword || "", admin.passwordHash);
    if (!matches) {
        return res.status(401).json({ message: "Current password is incorrect." });
    }

    const strongEnough = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(newPassword || "");
    if (!strongEnough) {
        return res.status(400).json({
            message: "New password must be at least 12 characters and include upper-case, lower-case, a number, and a symbol."
        });
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    admin.passwordChangedAt = new Date();
    admin.refreshSessions = [];
    await admin.save();

    logAudit({ adminId: admin._id, action: "PASSWORD_CHANGED", ip: req.ip, userAgent: req.get("user-agent") });

    res.clearCookie(ACCESS_COOKIE, cookieBase);
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: REFRESH_COOKIE_PATH });
    res.json({ message: "Password updated. Please log in again." });
};
