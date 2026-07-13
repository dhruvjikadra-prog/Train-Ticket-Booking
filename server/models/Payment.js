const mongoose = require("mongoose");

const paymentDetailsSchema = new mongoose.Schema(
    {
        // UPI
        upiId: {
            type: String,
            trim: true,
            default: null
        },

        // Card
        cardBrand: {
            type: String,
            trim: true,
            default: null
        },
        cardLast4: {
            type: String,
            trim: true,
            match: /^\d{4}$/,
            default: null
        },
        nameOnCard: {
            type: String,
            trim: true,
            default: null
        },

        // Net Banking
        bankName: {
            type: String,
            trim: true,
            default: null
        },
        accountNumber: {
            type: String,
            trim: true,
            default: null
        },
        accountHolder: {
            type: String,
            trim: true,
            default: null
        },
        ifscCode: {
            type: String,
            trim: true,
            uppercase: true,
            match: /^[A-Z]{4}0[A-Z0-9]{6}$/,
            default: null
        },

        // Wallet
        walletName: {
            type: String,
            trim: true,
            default: null
        },
        walletMobile: {
            type: String,
            trim: true,
            match: /^\d{10}$/,
            default: null
        }
    },
    { _id: false }
);

const paymentSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true
        },
        bookingToken: {
            type: String,
            required: true,
            index: true
        },
        transactionId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        gatewayPaymentId: {
            type: String,
            trim: true,
            default: null
        },
        paymentMethod: {
            type: String,
            required: true,
            enum: ["UPI", "CARD", "NETBANKING", "WALLET"]
        },
        paymentDetails: {
            type: paymentDetailsSchema,
            required: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            enum: ["INR"],
            default: "INR"
        },
        status: {
            type: String,
            enum: ["INITIATED", "SUCCESS", "FAILED", "REFUNDED"],
            default: "INITIATED",
            index: true
        },
        gatewayStatus: {
            type: String,
            trim: true,
            default: null
        },
        failureReason: {
            type: String,
            trim: true,
            default: null
        },
        paidAt: {
            type: Date,
            default: null
        },
        failedAt: {
            type: Date,
            default: null
        },
        refundedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// A booking can have multiple failed attempts, but only one successful payment.
paymentSchema.index(
    { bookingId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "SUCCESS" }
    }
);

module.exports = mongoose.model("Payment", paymentSchema);
