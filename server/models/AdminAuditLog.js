const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema(
    {
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        emailAttempted: String,

        action: {
            type: String,
            enum: [
                "LOGIN_SUCCESS",
                "LOGIN_FAILED",
                "ACCOUNT_LOCKED",
                "OTP_FAILED",
                "OTP_SUCCESS",
                "TOKEN_REFRESHED",
                "TOKEN_REUSE_DETECTED",
                "LOGOUT",
                "PASSWORD_CHANGED",
                "TWO_FACTOR_ENABLED",
                "TWO_FACTOR_DISABLED",
                "TRAIN_CREATED",
                "SEATS_RELEASED"
            ],
            required: true
        },

        ip: String,
        userAgent: String,
        reason: String
    },
    { timestamps: true }
);

adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);
