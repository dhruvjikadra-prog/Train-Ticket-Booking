const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10000; // hard ceiling so a broad filter can't be used to dump the whole collection in one request

const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORTABLE_FIELDS = new Set(["createdAt", "amount", "status", "paymentMethod", "paidAt"]);

const PAYMENT_METHODS = new Set(["UPI", "CARD", "NETBANKING", "WALLET"]);
const PAYMENT_STATUSES = new Set(["INITIATED", "SUCCESS", "FAILED", "REFUNDED"]);

/**
 * Builds a Mongo filter from query params, same additive-AND / fan-out-OR
 * shape as buildBookingFilter in adminBookingControllers. Because most of
 * what an admin recognizes a payment by (PNR, customer email/mobile) lives
 * on the Booking doc rather than the Payment doc, a free-text search also
 * resolves matching bookingIds and folds them into the same $or.
 */
const buildPaymentFilter = async (query) => {
    const filter = {};

    if (query.status && PAYMENT_STATUSES.has(String(query.status).toUpperCase())) {
        filter.status = String(query.status).toUpperCase();
    }
    if (query.paymentMethod && PAYMENT_METHODS.has(String(query.paymentMethod).toUpperCase())) {
        filter.paymentMethod = String(query.paymentMethod).toUpperCase();
    }
    if (query.bookingToken) filter.bookingToken = String(query.bookingToken).trim();

    if (query.amountMin || query.amountMax) {
        filter.amount = {};
        if (query.amountMin) filter.amount.$gte = Number(query.amountMin);
        if (query.amountMax) filter.amount.$lte = Number(query.amountMax);
    }

    if (query.createdFrom || query.createdTo) {
        filter.createdAt = {};
        if (query.createdFrom) filter.createdAt.$gte = new Date(query.createdFrom);
        if (query.createdTo) filter.createdAt.$lte = new Date(query.createdTo);
    }

    const term = String(query.search || "").trim();
    if (term) {
        const regex = new RegExp(escapeRegex(term), "i");

        const orClauses = [
            { transactionId: regex },
            { gatewayPaymentId: regex },
            { bookingToken: regex },
            { "paymentDetails.upiId": regex },
            { "paymentDetails.cardLast4": regex },
            { "paymentDetails.nameOnCard": regex },
            { "paymentDetails.bankName": regex },
            { "paymentDetails.ifscCode": regex },
            { "paymentDetails.accountNumber": regex },
            { "paymentDetails.accountHolder": regex },
            { "paymentDetails.walletName": regex },
            { "paymentDetails.walletMobile": regex }
        ];

        // Let admins search by PNR or the contact details captured on the
        // booking itself; a Payment doc doesn't carry these fields directly.
        const matchingBookings = await Booking.find(
            {
                $or: [
                    { pnrNumber: regex },
                    { "contact.email": regex },
                    { "contact.mobile": regex }
                ]
            },
            { _id: 1 }
        )
            .limit(500)
            .lean();

        if (matchingBookings.length) {
            orClauses.push({ bookingId: { $in: matchingBookings.map((b) => b._id) } });
        }

        filter.$or = orClauses;
    }

    return filter;
};

/**
 * Turns the raw paymentMethod + paymentDetails pair into one human-readable
 * line, e.g. "HDFC Bank •••• 4242" or "9876543210@upi", so the report table
 * and CSV export don't need to know the shape of paymentDetails.
 */
const describePaymentMethod = (payment) => {
    const details = payment.paymentDetails || {};

    switch (payment.paymentMethod) {
        case "UPI":
            return details.upiId || "UPI";
        case "CARD":
            return details.cardLast4
                ? `${details.cardBrand || "Card"} •••• ${details.cardLast4}`
                : details.cardBrand || "Card";
        case "NETBANKING":
            return details.accountNumber
                ? `${details.bankName || "Net Banking"}`
                : details.bankName || "Net Banking";
        case "WALLET":
            return details.walletName || "Wallet";
        default:
            return payment.paymentMethod || "—";
    }
};

const formatBookingRef = (booking) => {
    if (!booking) return null;
    return {
        id: booking._id,
        pnrNumber: booking.pnrNumber || null,
        fromStation: booking.fromStation,
        toStation: booking.toStation,
        journeyDate: booking.journeyDate,
        trainNo: booking.trainNo,
        bookingStatus: booking.bookingStatus,
        totalFare: booking.totalFare
    };
};

const formatUserRef = (user) => {
    if (!user) return null;
    return { id: user._id, name: user.name, email: user.email, mobile: user.mobile };
};

const formatPaymentSummary = (payment) => ({
    id: payment._id,
    transactionId: payment.transactionId,
    gatewayPaymentId: payment.gatewayPaymentId,
    bookingToken: payment.bookingToken,
    booking: formatBookingRef(payment.bookingId),
    user: formatUserRef(payment.bookingId?.userId),
    paymentMethod: payment.paymentMethod,
    methodLabel: describePaymentMethod(payment),
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    gatewayStatus: payment.gatewayStatus,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt
});

const formatPaymentDetail = (payment) => ({
    ...formatPaymentSummary(payment),
    paymentDetails: payment.paymentDetails || {},
    failureReason: payment.failureReason,
    failedAt: payment.failedAt,
    refundedAt: payment.refundedAt,
    updatedAt: payment.updatedAt
});

/**
 * GET /api/admin/payments
 * Paginated, filterable, searchable payment ledger + aggregate summary for
 * the currently applied filter set. Requires requireAdminAuth upstream.
 */
const getPaymentsReport = async (req, res) => {
    try {
        const page = toInt(req.query.page, 1);
        const limit = Math.min(toInt(req.query.limit, 20), MAX_PAGE_SIZE);
        const sortField = SORTABLE_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        const filter = await buildPaymentFilter(req.query);

        const [payments, total, summaryAgg] = await Promise.all([
            Payment.find(filter)
                .populate({
                    path: "bookingId",
                    select: "pnrNumber fromStation toStation journeyDate trainNo bookingStatus totalFare userId",
                    populate: { path: "userId", select: "name email mobile" }
                })
                .sort({ [sortField]: sortOrder, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Payment.countDocuments(filter),
            Payment.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$amount" },
                        successAmount: {
                            $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, "$amount", 0] }
                        },
                        refundedAmount: {
                            $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, "$amount", 0] }
                        },
                        success: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
                        initiated: { $sum: { $cond: [{ $eq: ["$status", "INITIATED"] }, 1, 0] } },
                        refunded: { $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, 1, 0] } }
                    }
                }
            ])
        ]);

        const summary = summaryAgg[0] || {
            totalAmount: 0,
            successAmount: 0,
            refundedAmount: 0,
            success: 0,
            failed: 0,
            initiated: 0,
            refunded: 0
        };

        res.json({
            payments: payments.map(formatPaymentSummary),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            },
            summary: {
                totalPayments: total,
                totalAmount: summary.totalAmount,
                successAmount: summary.successAmount,
                refundedAmount: summary.refundedAmount,
                success: summary.success,
                failed: summary.failed,
                initiated: summary.initiated,
                refunded: summary.refunded
            }
        });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load payment reports right now.",
            error: error.message
        });
    }
};

/**
 * GET /api/admin/payments/:id
 * Full detail for a single payment — method details, gateway linkage, and
 * the booking it belongs to. Accepts either a Mongo _id or a transactionId
 * so the admin UI can deep-link either way.
 */
const getPaymentReportById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { transactionId: id };

        const payment = await Payment.findOne(query)
            .populate({
                path: "bookingId",
                select:
                    "pnrNumber fromStation toStation journeyDate trainNo classCode bookingStatus totalFare userId contact",
                populate: { path: "userId", select: "name email mobile" }
            })
            .lean();

        if (!payment) {
            return res.status(404).json({ message: "Payment not found." });
        }

        res.json({ payment: formatPaymentDetail(payment) });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load this payment.",
            error: error.message
        });
    }
};

const csvEscape = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * GET /api/admin/payments/export
 * Streams the currently-filtered ledger as CSV. Capped at MAX_EXPORT_ROWS so
 * an unfiltered request can't be used to pull the entire payments collection
 * in one shot.
 */
const exportPaymentsCsv = async (req, res) => {
    try {
        const filter = await buildPaymentFilter(req.query);

        const payments = await Payment.find(filter)
            .populate({
                path: "bookingId",
                select: "pnrNumber fromStation toStation journeyDate trainNo userId",
                populate: { path: "userId", select: "name email" }
            })
            .sort({ createdAt: -1 })
            .limit(MAX_EXPORT_ROWS)
            .lean();

        const header = [
            "Transaction ID",
            "Gateway Payment ID",
            "PNR",
            "Booking Token",
            "User Name",
            "User Email",
            "Route",
            "Journey Date",
            "Payment Method",
            "Method Detail",
            "IFSC Code",
            "Account Holder",
            "Amount",
            "Currency",
            "Status",
            "Gateway Status",
            "Failure Reason",
            "Paid At",
            "Failed At",
            "Refunded At",
            "Created At"
        ];

        const rows = payments.map((payment) =>
            [
                payment.transactionId,
                payment.gatewayPaymentId,
                payment.bookingId?.pnrNumber,
                payment.bookingToken,
                payment.bookingId?.userId?.name,
                payment.bookingId?.userId?.email,
                payment.bookingId ? `${payment.bookingId.fromStation} to ${payment.bookingId.toStation}` : "",
                payment.bookingId?.journeyDate,
                payment.paymentMethod,
                describePaymentMethod(payment),
                payment.paymentMethod === "NETBANKING" ? payment.paymentDetails?.ifscCode : "",
                payment.paymentMethod === "NETBANKING" ? payment.paymentDetails?.accountHolderName : "",
                payment.amount,
                payment.currency,
                payment.status,
                payment.gatewayStatus,
                payment.failureReason,
                payment.paidAt?.toISOString?.() || payment.paidAt,
                payment.failedAt?.toISOString?.() || payment.failedAt,
                payment.refundedAt?.toISOString?.() || payment.refundedAt,
                payment.createdAt?.toISOString?.() || payment.createdAt
            ]
                .map(csvEscape)
                .join(",")
        );

        const csv = [header.join(","), ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="payment-report-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({
            message: "Unable to export payment report right now.",
            error: error.message
        });
    }
};

module.exports = {
    getPaymentsReport,
    getPaymentReportById,
    exportPaymentsCsv
};