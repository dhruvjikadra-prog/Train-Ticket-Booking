const AdminAuditLog = require("../models/AdminAuditLog");
const Booking = require("../models/Booking");
const Coach = require("../models/Coach");
const Payment = require("../models/Payment");
const Station = require("../models/Station");
const Train = require("../models/Train");

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function daysAgo(days) {
    const date = startOfToday();
    date.setDate(date.getDate() - days);
    return date;
}

function dateKey(date) {
    return date.toISOString().slice(0, 10);
}

function mapCountByKey(items, keyName = "_id") {
    return items.reduce((acc, item) => {
        acc[item[keyName] || "unknown"] = item.count || 0;
        return acc;
    }, {});
}

exports.getOverview = async (req, res) => {
    try {
        const today = startOfToday();
        const trendStart = daysAgo(6);

        const [
            totalBookings,
            todayBookings,
            confirmedBookings,
            pendingBookings,
            cancelledBookings,
            activeTrains,
            inactiveTrains,
            stationCount,
            successfulPayments,
            failedPayments,
            totalRevenueAgg,
            todayRevenueAgg,
            bookingTrendAgg,
            statusAgg,
            paymentMethodAgg,
            topTrainAgg,
            seatStatusAgg,
            recentBookings,
            recentAuditLogs
        ] = await Promise.all([
            Booking.countDocuments({}),
            Booking.countDocuments({ createdAt: { $gte: today } }),
            Booking.countDocuments({
                $or: [
                    { bookingStatus: "completed" },
                    { status: "confirmed" }
                ]
            }),
            Booking.countDocuments({
                cancellationStatus: { $ne: "FULLY_CANCELLED" },
                $or: [
                    {
                        bookingStatus: {
                            $in: [
                                "pending",
                                "seat_selected",
                                "review_completed",
                                "payment_processing",
                                "payment_success"
                            ]
                        }
                    },
                    {
                        status: {
                            $in: [
                                "pending",
                                "seats_selected",
                                "seat_selected",
                                "review_completed",
                                "payment_processing",
                                "payment_success"
                            ]
                        }
                    }
                ]
            }),
            Booking.countDocuments({
                $or: [
                    { cancellationStatus: "FULLY_CANCELLED" },
                    { status: "cancelled" }
                ]
            }),
            Train.countDocuments({ status: "ACTIVE" }),
            Train.countDocuments({ status: "INACTIVE" }),
            Station.countDocuments({}),
            Payment.countDocuments({ status: "SUCCESS" }),
            Payment.countDocuments({ status: "FAILED" }),
            Payment.aggregate([
                { $match: { status: "SUCCESS" } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            Payment.aggregate([
                { $match: { status: "SUCCESS", createdAt: { $gte: today } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            Booking.aggregate([
                { $match: { createdAt: { $gte: trendStart } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 },
                        revenue: { $sum: "$totalFare" }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Booking.aggregate([
                {
                    $group: {
                        _id: { $ifNull: ["$bookingStatus", "$status"] },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]),
            Payment.aggregate([
                { $match: { status: "SUCCESS" } },
                { $group: { _id: "$paymentMethod", count: { $sum: 1 }, revenue: { $sum: "$amount" } } },
                { $sort: { count: -1 } }
            ]),
            Booking.aggregate([
                {
                    $group: {
                        _id: "$trainNo",
                        bookings: { $sum: 1 },
                        revenue: { $sum: "$totalFare" },
                        lastBookedAt: { $max: "$createdAt" }
                    }
                },
                { $sort: { bookings: -1, revenue: -1 } },
                { $limit: 5 }
            ]),
            Coach.aggregate([
                { $unwind: "$seats" },
                { $group: { _id: "$seats.status", count: { $sum: 1 } } }
            ]),
            Booking.find({})
                .sort({ createdAt: -1 })
                .limit(8)
                .populate("trainId", "name trainNumber")
                .select("pnrNumber trainNo trainId fromStation toStation journeyDate classCode passengers totalFare bookingStatus reservationStatus cancellationStatus status paymentStatus createdAt")
                .lean(),
            AdminAuditLog.find({})
                .sort({ createdAt: -1 })
                .limit(8)
                .select("action reason emailAttempted createdAt")
                .lean()
        ]);

        const trendMap = bookingTrendAgg.reduce((acc, item) => {
            acc[item._id] = item;
            return acc;
        }, {});

        const bookingTrend = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(trendStart);
            date.setDate(trendStart.getDate() + index);
            const key = dateKey(date);
            const item = trendMap[key] || {};

            return {
                date: key,
                count: item.count || 0,
                revenue: item.revenue || 0
            };
        });

        const seatStatus = mapCountByKey(seatStatusAgg);
        const totalSeats = Object.values(seatStatus).reduce((sum, count) => sum + count, 0);
        const statusCounts = mapCountByKey(statusAgg);

        res.json({
            admin: {
                name: req.admin.name,
                email: req.admin.email,
                role: req.admin.role,
                twoFactorEnabled: req.admin.twoFactorEnabled,
                lastLoginAt: req.admin.lastLoginAt
            },
            stats: {
                totalBookings,
                todayBookings,
                confirmedBookings,
                pendingBookings,
                cancelledBookings,
                activeTrains,
                inactiveTrains,
                stationCount,
                successfulPayments,
                failedPayments,
                totalRevenue: totalRevenueAgg[0]?.total || 0,
                todayRevenue: todayRevenueAgg[0]?.total || 0,
                totalSeats,
                bookedSeats: seatStatus.BOOKED || 0,
                heldSeats: seatStatus.HELD || 0,
                availableSeats: seatStatus.AVAILABLE || 0,
                blockedSeats: seatStatus.BLOCKED || 0
            },
            bookingTrend,
            statusBreakdown: {
                pending: statusCounts.pending || 0,
                seat_selected:
                    statusCounts.seat_selected ||
                    statusCounts.seats_selected ||
                    0,
                seats_selected:
                    statusCounts.seat_selected ||
                    statusCounts.seats_selected ||
                    0,
                review_completed: statusCounts.review_completed || 0,
                payment_processing: statusCounts.payment_processing || 0,
                payment_success: statusCounts.payment_success || 0,
                completed:
                    statusCounts.completed ||
                    statusCounts.confirmed ||
                    0,
                confirmed:
                    statusCounts.completed ||
                    statusCounts.confirmed ||
                    0,
                expired: statusCounts.expired || 0,
                cancelled: cancelledBookings,
                cancelledBookings
            },
            paymentMethods: paymentMethodAgg.map((item) => ({
                method: item._id || "UNKNOWN",
                count: item.count,
                revenue: item.revenue
            })),
            topTrains: topTrainAgg.map((item) => ({
                trainNo: item._id || "N/A",
                bookings: item.bookings,
                revenue: item.revenue,
                lastBookedAt: item.lastBookedAt
            })),
            recentBookings: recentBookings.map((booking) => ({
                id: booking._id,
                pnrNumber: booking.pnrNumber || "Pending",
                trainNo: booking.trainNo,
                trainName: booking.trainId?.name || "Train",
                fromStation: booking.fromStation,
                toStation: booking.toStation,
                journeyDate: booking.journeyDate,
                classCode: booking.classCode,
                passengerCount: booking.passengers?.length || 0,
                totalFare: booking.totalFare,
                status: booking.bookingStatus || booking.status,
                reservationStatus: booking.reservationStatus,
                cancellationStatus: booking.cancellationStatus,
                paymentStatus: booking.paymentStatus,
                createdAt: booking.createdAt
            })),
            recentAuditLogs: recentAuditLogs.map((log) => ({
                id: log._id,
                action: log.action,
                reason: log.reason,
                emailAttempted: log.emailAttempted,
                createdAt: log.createdAt
            }))
        });
    } catch (error) {
        console.error("admin dashboard overview error:", error);
        res.status(500).json({ message: "Unable to load admin dashboard." });
    }
};
