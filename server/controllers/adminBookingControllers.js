const mongoose = require("mongoose");
const Booking = require("../models/Booking");

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10000; // hard ceiling so a broad filter can't be used to dump the whole collection in one request

const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num > 0 ? num : fallback;
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORTABLE_FIELDS = new Set([
    "createdAt",
    "journeyDate",
    "totalFare",
    "bookingStatus",
    "paymentStatus"
]);

/**
 * Builds a Mongo filter from query params. Every field is optional and
 * additive (AND), except `search`, which fans out into an OR across the
 * fields an admin would realistically search a PNR/booking by.
 */
const buildBookingFilter = (query) => {
    const filter = {};

    if (query.bookingStatus) filter.bookingStatus = query.bookingStatus;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.cancellationStatus) filter.cancellationStatus = query.cancellationStatus;
    if (query.reservationStatus) filter.reservationStatus = query.reservationStatus;
    if (query.classCode) filter.classCode = String(query.classCode).toUpperCase();
    if (query.trainNo) filter.trainNo = String(query.trainNo).trim();
    if (query.fromStation) filter.fromStation = String(query.fromStation).toUpperCase().trim();
    if (query.toStation) filter.toStation = String(query.toStation).toUpperCase().trim();

    if (query.journeyDateFrom || query.journeyDateTo) {
        filter.journeyDate = {};
        if (query.journeyDateFrom) filter.journeyDate.$gte = String(query.journeyDateFrom);
        if (query.journeyDateTo) filter.journeyDate.$lte = String(query.journeyDateTo);
    }

    if (query.createdFrom || query.createdTo) {
        filter.createdAt = {};
        if (query.createdFrom) filter.createdAt.$gte = new Date(query.createdFrom);
        if (query.createdTo) filter.createdAt.$lte = new Date(query.createdTo);
    }

    const term = String(query.search || "").trim();
    if (term) {
        const regex = new RegExp(escapeRegex(term), "i");
        filter.$or = [
            { pnrNumber: regex },
            { bookingToken: regex },
            { trainNo: regex },
            { fromStation: regex },
            { toStation: regex },
            { "contact.email": regex },
            { "contact.mobile": regex },
            { "passengers.name": regex }
        ];
    }

    return filter;
};

const formatPassenger = (passenger) => ({
    id: passenger._id,
    name: passenger.name,
    age: passenger.age,
    gender: passenger.gender,
    seniorCitizen: passenger.seniorCitizen,
    seatNumber: passenger.seatNumber,
    cancelledSeatNumber: passenger.cancelledSeatNumber,
    reservationStatus: passenger.reservationStatus,
    status: passenger.status,
    cancelledAt: passenger.cancelledAt,
    cancellationReason: passenger.cancellationReason
});

const formatBookingSummary = (booking) => ({
    id: booking._id,
    bookingToken: booking.bookingToken,
    pnrNumber: booking.pnrNumber || null,
    user: booking.userId
        ? {
            id: booking.userId._id,
            name: booking.userId.name,
            email: booking.userId.email,
            mobile: booking.userId.mobile
        }
        : null,
    train: {
        id: booking.trainId?._id || booking.trainId || null,
        trainNo: booking.trainNo,
        trainName: booking.trainId?.trainName || null
    },
    fromStation: booking.fromStation,
    toStation: booking.toStation,
    journeyDate: booking.journeyDate,
    classCode: booking.classCode,
    passengerCount: booking.passengers?.length || 0,
    totalFare: booking.totalFare,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    reservationStatus: booking.reservationStatus,
    cancellationStatus: booking.cancellationStatus,
    createdAt: booking.createdAt
});

const formatBookingDetail = (booking) => ({
    ...formatBookingSummary(booking),
    farePerPassenger: booking.farePerPassenger,
    contact: booking.contact,
    passengers: (booking.passengers || []).map(formatPassenger),
    selectedSeats: booking.selectedSeats,
    paymentId: booking.paymentId,
    paymentProcessingStartedAt: booking.paymentProcessingStartedAt,
    paidAt: booking.paidAt,
    ticketGeneratedAt: booking.ticketGeneratedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    cancellationHistory: booking.cancellationHistory || [],
    expiresAt: booking.expiresAt,
    updatedAt: booking.updatedAt
});

/**
 * GET /api/admin/bookings
 * Paginated, filterable, searchable booking report + aggregate summary for
 * the currently applied filter set. Requires verifyAdminToken upstream.
 */
const getBookingsReport = async (req, res) => {
    try {
        const page = toInt(req.query.page, 1);
        const limit = Math.min(toInt(req.query.limit, 20), MAX_PAGE_SIZE);
        const sortField = SORTABLE_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        const filter = buildBookingFilter(req.query);

        const [bookings, total, summaryAgg] = await Promise.all([
            Booking.find(filter)
                .populate("userId", "name email mobile")
                .populate("trainId", "trainNo trainName")
                .sort({ [sortField]: sortOrder, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Booking.countDocuments(filter),
            Booking.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$totalFare" },
                        totalPassengers: { $sum: { $size: "$passengers" } },
                        completed: {
                            $sum: { $cond: [{ $eq: ["$bookingStatus", "completed"] }, 1, 0] }
                        },
                        pending: {
                            $sum: { $cond: [{ $eq: ["$bookingStatus", "pending"] }, 1, 0] }
                        },
                        cancelled: {
                            $sum: {
                                $cond: [{ $eq: ["$cancellationStatus", "FULLY_CANCELLED"] }, 1, 0]
                            }
                        },
                        refunded: {
                            $sum: { $cond: [{ $eq: ["$paymentStatus", "refunded"] }, 1, 0] }
                        }
                    }
                }
            ])
        ]);

        const summary = summaryAgg[0] || {
            totalRevenue: 0,
            totalPassengers: 0,
            completed: 0,
            pending: 0,
            cancelled: 0,
            refunded: 0
        };

        res.json({
            bookings: bookings.map(formatBookingSummary),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            },
            summary: {
                totalBookings: total,
                totalRevenue: summary.totalRevenue,
                totalPassengers: summary.totalPassengers,
                completed: summary.completed,
                pending: summary.pending,
                cancelled: summary.cancelled,
                refunded: summary.refunded
            }
        });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load booking reports right now.",
            error: error.message
        });
    }
};

/**
 * GET /api/admin/bookings/:id
 * Full detail for a single booking — passengers, contact, cancellation
 * history, payment linkage. Accepts either a Mongo _id or a bookingToken so
 * the admin UI can deep-link either way.
 */
const getBookingReportById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = mongoose.Types.ObjectId.isValid(id)
            ? { _id: id }
            : { bookingToken: id };

        const booking = await Booking.findOne(query)
            .populate("userId", "name email mobile")
            .populate("trainId", "trainNo trainName")
            .populate("paymentId")
            .lean();

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        res.json({ booking: formatBookingDetail(booking) });
    } catch (error) {
        res.status(500).json({
            message: "Unable to load this booking.",
            error: error.message
        });
    }
};

const csvEscape = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * GET /api/admin/bookings/export
 * Streams the currently-filtered report as CSV. Capped at MAX_EXPORT_ROWS so
 * an unfiltered request can't be used to pull the entire booking collection
 * in one shot.
 */
const exportBookingsCsv = async (req, res) => {
    try {
        const filter = buildBookingFilter(req.query);

        const bookings = await Booking.find(filter)
            .populate("userId", "name email")
            .populate("trainId", "trainNo trainName")
            .sort({ createdAt: -1 })
            .limit(MAX_EXPORT_ROWS)
            .lean();

        const header = [
            "PNR",
            "Booking Token",
            "User Name",
            "User Email",
            "Train No",
            "Train Name",
            "From",
            "To",
            "Journey Date",
            "Class",
            "Passengers",
            "Total Fare",
            "Booking Status",
            "Payment Status",
            "Reservation Status",
            "Cancellation Status",
            "Created At"
        ];

        const rows = bookings.map((booking) =>
            [
                booking.pnrNumber,
                booking.bookingToken,
                booking.userId?.name,
                booking.userId?.email,
                booking.trainNo,
                booking.trainId?.trainName,
                booking.fromStation,
                booking.toStation,
                booking.journeyDate,
                booking.classCode,
                booking.passengers?.length || 0,
                booking.totalFare,
                booking.bookingStatus,
                booking.paymentStatus,
                booking.reservationStatus,
                booking.cancellationStatus,
                booking.createdAt?.toISOString?.() || booking.createdAt
            ]
                .map(csvEscape)
                .join(",")
        );

        const csv = [header.join(","), ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="booking-report-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({
            message: "Unable to export booking report right now.",
            error: error.message
        });
    }
};

module.exports = {
    getBookingsReport,
    getBookingReportById,
    exportBookingsCsv
};