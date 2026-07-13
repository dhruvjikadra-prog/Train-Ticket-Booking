const Admin = require("../models/Admin");
const { verifyAccessToken } = require("../utils/tokens");

const ACCESS_COOKIE = "ttb_admin_at";

async function requireAdminAuth(req, res, next) {
    try {
        const token = req.cookies?.[ACCESS_COOKIE];

        if (!token) {
            return res.status(401).json({ message: "Not authenticated." });
        }

        const payload = verifyAccessToken(token);
        const admin = await Admin.findById(payload.sub);

        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: "Not authenticated." });
        }

        req.admin = admin;
        next();
    } catch {
        return res.status(401).json({ message: "Session expired. Please log in again." });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.admin || !roles.includes(req.admin.role)) {
            return res.status(403).json({ message: "You don't have permission to do that." });
        }

        next();
    };
}

module.exports = { requireAdminAuth, requireRole, ACCESS_COOKIE };
