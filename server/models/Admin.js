const mongoose = require("mongoose");

const refreshSessionSchema = new mongoose.Schema(
    {
        tokenHash: { type: String, required: true },
        ip: String,
        userAgent: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true }
    },
    { _id: false }
);

const adminSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"]
        },

        passwordHash: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: String,
            enum: ["admin", "superadmin"],
            default: "admin"
        },

        isActive: {
            type: Boolean,
            default: true
        },

        failedLoginAttempts: { type: Number, default: 0 },
        lockUntil: { type: Date, default: null },

        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, select: false },

        refreshSessions: { type: [refreshSessionSchema], default: [] },

        passwordChangedAt: { type: Date, default: Date.now },
        lastLoginAt: Date,
        lastLoginIp: String
    },
    { timestamps: true }
);

// adminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("Admin", adminSchema);
