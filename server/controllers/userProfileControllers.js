const bcrypt = require("bcryptjs");
const User = require("../models/Users");

// NOTE: assumes the rest of the app hashes passwords with bcryptjs at
// registration/login too. If registration actually uses a different
// library (e.g. "bcrypt") or a different salt round count, align this
// file with that so a changed password can still be verified at login.
const SALT_ROUNDS = 10;

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s.'-]*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

// At least 8 chars, one uppercase, one lowercase, one digit, one symbol —
// shown to the user as plain-language rules, not just enforced blindly.
const PASSWORD_RULES = [
    { test: (value) => value.length >= 8, label: "At least 8 characters" },
    { test: (value) => /[A-Z]/.test(value), label: "One uppercase letter" },
    { test: (value) => /[a-z]/.test(value), label: "One lowercase letter" },
    { test: (value) => /\d/.test(value), label: "One number" },
    { test: (value) => /[^A-Za-z0-9]/.test(value), label: "One special character" }
];

const formatUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile || null,
    role: user.role,
    memberSince: user.createdAt,
    updatedAt: user.updatedAt
});

/**
 * GET /api/users/me
 */
const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).lean();

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json({ user: formatUser(user) });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load your profile right now.",
            error: error.message
        });
    }
};

/**
 * PUT /api/users/me
 * Updates name/email/mobile. Email and mobile must stay unique across
 * accounts — checked explicitly (for a clean error message) and backstopped
 * by the schema's unique index in case of a race between two requests.
 */
const updateMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const errors = {};

        const name = String(req.body.name ?? user.name ?? "").trim();
        if (!name) {
            errors.name = "Name is required.";
        } else if (name.length < 2 || name.length > 80 || !NAME_PATTERN.test(name)) {
            errors.name = "Enter a valid name (letters only).";
        }

        const email = String(req.body.email ?? user.email ?? "").trim().toLowerCase();
        if (!email) {
            errors.email = "Email is required.";
        } else if (!EMAIL_PATTERN.test(email)) {
            errors.email = "Enter a valid email address.";
        }

        // Mobile is optional — only validate/require it if the person is
        // actually setting or changing it, not on every save.
        const mobileProvided = Object.prototype.hasOwnProperty.call(req.body, "mobile");
        const mobile = mobileProvided ? String(req.body.mobile || "").trim() : user.mobile;

        if (mobileProvided && mobile && !MOBILE_PATTERN.test(mobile)) {
            errors.mobile = "Enter a valid 10-digit mobile number.";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
        }

        if (email !== user.email) {
            const emailTaken = await User.findOne({
                email,
                _id: { $ne: user._id }
            }).lean();

            if (emailTaken) {
                return res.status(409).json({
                    message: "This email is already registered to another account.",
                    errors: { email: "This email is already registered to another account." }
                });
            }
        }

        if (mobileProvided && mobile && mobile !== user.mobile) {
            const mobileTaken = await User.findOne({
                mobile,
                _id: { $ne: user._id }
            }).lean();

            if (mobileTaken) {
                return res.status(409).json({
                    message: "This mobile number is already registered to another account.",
                    errors: { mobile: "This mobile number is already registered to another account." }
                });
            }
        }

        user.name = name;
        user.email = email;
        if (mobileProvided) {
            user.mobile = mobile || undefined;
        }

        await user.save();

        res.json({
            message: "Profile updated successfully.",
            user: formatUser(user)
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || "field";
            return res.status(409).json({
                message: `This ${field} is already registered to another account.`,
                errors: { [field]: `This ${field} is already in use.` }
            });
        }

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)
                .map((item) => item.message)
                .join(", ");
            return res.status(400).json({ message });
        }

        res.status(500).json({
            message: "Unable to update your profile right now.",
            error: error.message
        });
    }
};

/**
 * PUT /api/users/me/password
 * Requires the current password (never trust that whoever holds the
 * session cookie is definitely the account owner sitting at the keyboard
 * right now — e.g. a shared/unlocked device) and a new password that
 * passes the same strength rules shown in the UI.
 */
const changeMyPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword) {
            return res.status(400).json({
                message: "Please enter your current password.",
                errors: { currentPassword: "Current password is required." }
            });
        }

        if (!newPassword) {
            return res.status(400).json({
                message: "Please enter a new password.",
                errors: { newPassword: "New password is required." }
            });
        }

        const failedRules = PASSWORD_RULES.filter((rule) => !rule.test(newPassword));
        if (failedRules.length > 0) {
            return res.status(400).json({
                message: "Your new password doesn't meet the strength requirements.",
                errors: {
                    newPassword: `Missing: ${failedRules.map((rule) => rule.label).join(", ")}`
                }
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                message: "Passwords do not match.",
                errors: { confirmPassword: "Passwords do not match." }
            });
        }

        const user = await User.findById(req.user.id).select("+password");

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const currentPasswordValid = await bcrypt.compare(currentPassword, user.password);

        if (!currentPasswordValid) {
            return res.status(401).json({
                message: "Your current password is incorrect.",
                errors: { currentPassword: "Current password is incorrect." }
            });
        }

        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            return res.status(400).json({
                message: "New password must be different from your current password.",
                errors: { newPassword: "Choose a password you haven't used before." }
            });
        }

        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.save();

        res.json({ message: "Password changed successfully." });
    } catch (error) {
        res.status(500).json({
            message: "Unable to change your password right now.",
            error: error.message
        });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile,
    changeMyPassword,
    PASSWORD_RULES
};
