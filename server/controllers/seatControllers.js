const mongoose = require("mongoose");

const Seat = require("../models/Seat");
const SeatMap = require("../models/SeatMap");
const Booking = require("../models/Booking");
const Coach = require("../models/Coach");
const Train = require("../models/Train");
const AdminAuditLog = require("../models/AdminAuditLog");
const { buildJourneyDateFilter } = require("../utils/journeyDate");
const { getCoachConfig } = require("../utils/coachLayout");
const {
    ensureCoachesForJourney,
    releaseExpiredHolds,
    getSeatStatusesForSegment
} = require("../services/coachService");

const WEEKDAYS_BY_INDEX = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getStoredJourneyDate = (journeyDate) => {
    if (!DATE_ONLY_PATTERN.test(String(journeyDate || "").trim())) {
        return null;
    }

    return new Date(`${journeyDate}T00:00:00.000Z`);
};

const getClassAvailability = (inventory, trainClasses = []) => {
    return trainClasses.map((trainClass) => {
        const code = trainClass.code;
        const availability = inventory.availability instanceof Map
            ? inventory.availability.get(code)
            : inventory.availability?.[code];
        const bookedSeats = inventory.bookedSeats instanceof Map
            ? inventory.bookedSeats.get(code)
            : inventory.bookedSeats?.[code];
        const waitlist = inventory.waitlist instanceof Map
            ? inventory.waitlist.get(code)
            : inventory.waitlist?.[code];

        return {
            code,
            name: trainClass.name,
            totalSeats: trainClass.totalSeats,
            availableSeats: Number(availability || 0),
            bookedSeats: Array.isArray(bookedSeats) ? bookedSeats.length : 0,
            waitlist: Number(waitlist || 0)
        };
    });
};

const getCoachSummary = async ({ trainId, journeyDate, trainClasses }) => {
    const dateFilter = buildJourneyDateFilter(journeyDate);
    const coaches = await Coach.find({
        trainId,
        journeyDate: dateFilter
    }).lean();

    return trainClasses.map((trainClass) => {
        const classCoaches = coaches.filter((coach) => coach.classCode === trainClass.code);

        return {
            code: trainClass.code,
            coachCount: classCoaches.length,
            seatCount: classCoaches.reduce((sum, coach) => sum + (coach.capacity || 0), 0)
        };
    });
};

const getDateFilterOrRespond = (journeyDate, res) => {
    const dateFilter = buildJourneyDateFilter(journeyDate);

    if (!dateFilter) {
        res.status(400).json({
            success: false,
            message: "Journey date must be a valid YYYY-MM-DD date."
        });
        return null;
    }

    return dateFilter;
};

/*
|--------------------------------------------------------------------------
| Get Seat Map By Train
|--------------------------------------------------------------------------
*/

const getSeatMap = async (req, res) => {
    try {

        const { trainId, classCode } = req.params;

        const seatMap = await SeatMap.find({
            trainId,
            classCode
        });

        if (!seatMap.length) {
            return res.status(404).json({
                success: false,
                message: "Seat map not found"
            });
        }

        res.status(200).json({
            success: true,
            data: seatMap
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/*
|--------------------------------------------------------------------------
| Get Journey/Class-specific Coach Seat Map
|--------------------------------------------------------------------------
*/

const getCoachSeatMap = async (req, res) => {
    try {
        const { token } = req.params;
        const booking = await Booking.findOne({ bookingToken: token }).populate("trainId", "route").lean();

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found"
            });
        }

        if (booking.expiresAt && new Date() > booking.expiresAt) {
            return res.status(410).json({
                success: false,
                message: "Booking session has expired"
            });
        }

        const config = getCoachConfig(booking.classCode);

        if (!config) {
            return res.status(400).json({
                success: false,
                message: `Unsupported class code: ${booking.classCode}`
            });
        }

        await ensureCoachesForJourney({
            trainId: booking.trainId,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        });

        await releaseExpiredHolds({
            trainId: booking.trainId,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        });

        const dateFilter = buildJourneyDateFilter(booking.journeyDate);
        const coaches = await Coach.find({
            trainId: booking.trainId,
            journeyDate: dateFilter,
            classCode: booking.classCode
        })
            .sort({ position: 1 })
            .lean();

        if (coaches.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Coach inventory has not been released for this journey date"
            });
        }

        const statusBySeat = await getSeatStatusesForSegment({
            trainId: booking.trainId,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode,
            coaches,
            fromStation: booking.fromStation,
            toStation: booking.toStation,
            currentBookingToken: booking.bookingToken
        });

        const safeCoaches = coaches.map((coach) => {

            const seats = coach.seats.map((seat) => {

                const computed = statusBySeat.get(seat.seatCode) || {
                    status: "AVAILABLE",
                    heldByCurrentBooking: false,
                    activeSegment: null
                };

                return {
                    _id: seat._id,
                    seatNumber: seat.seatNumber,
                    seatCode: seat.seatCode,
                    berthType: seat.berthType,
                    berthCode: seat.berthCode,
                    row: seat.row,
                    column: seat.column,
                    side: seat.side,
                    fromStation: computed.activeSegment?.fromStation || null,
                    toStation: computed.activeSegment?.toStation || null,
                    status: computed.status,

                    heldByCurrentBooking: computed.heldByCurrentBooking
                };
            });

            // <-- THIS RETURN WAS MISSING
            return {
                _id: coach._id,
                coachCode: coach.coachCode,
                coachType: coach.coachType,
                layoutType: coach.layoutType,
                classCode: coach.classCode,
                position: coach.position,
                capacity: coach.capacity,

                availableSeats: seats.filter(
                    (seat) =>
                        seat.status === "AVAILABLE" ||
                        seat.heldByCurrentBooking
                ).length,

                seats
            };
        });

        return res.status(200).json({
            success: true,
            classCode: booking.classCode,
            allowedCoachPrefix: config.prefix,
            journeyDate: booking.journeyDate,
            selectedSeats: booking.selectedSeats || [],
            coaches: safeCoaches
        });
    } catch (error) {
        console.error("getCoachSeatMap error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load coach seat map"
        });
    }
};

/*
|--------------------------------------------------------------------------
| Get Seat Availability
|--------------------------------------------------------------------------
*/

const getSeatAvailability = async (req, res) => {
    try {

        const {
            trainId,
            journeyDate,
            classCode
        } = req.query;
        const dateFilter = getDateFilterOrRespond(journeyDate, res);

        if (!dateFilter) return;

        const seatData = await Seat.findOne({
            trainId,
            journeyDate: dateFilter
        });

        if (!seatData) {
            return res.status(404).json({
                success: false,
                message: "Seat availability not found"
            });
        }

        res.status(200).json({
            success: true,
            availableSeats:
                seatData.availability.get(classCode) || 0,
            bookedSeats:
                seatData.bookedSeats.get(classCode) || []
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/*
|--------------------------------------------------------------------------
| Release Seat Inventory For A Journey Date
|--------------------------------------------------------------------------
*/

const releaseJourneySeats = async (req, res) => {
    try {
        const trainId = String(req.body.trainId || "").trim();
        const journeyDate = String(req.body.journeyDate || "").trim();
        const dateFilter = getDateFilterOrRespond(journeyDate, res);
        const storedJourneyDate = getStoredJourneyDate(journeyDate);

        if (!dateFilter || !storedJourneyDate) return;

        if (!trainId) {
            return res.status(400).json({
                success: false,
                message: "Train is required."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(trainId)) {
            return res.status(400).json({
                success: false,
                message: "Train id is invalid."
            });
        }

        const train = await Train.findById(trainId).lean();

        if (!train) {
            return res.status(404).json({
                success: false,
                message: "Train not found."
            });
        }

        if (train.status !== "ACTIVE") {
            return res.status(400).json({
                success: false,
                message: "Seats can only be released for active trains."
            });
        }

        const journeyWeekday = WEEKDAYS_BY_INDEX[storedJourneyDate.getUTCDay()];

        if (
            Array.isArray(train.runningDays) &&
            train.runningDays.length > 0 &&
            !train.runningDays.includes(journeyWeekday)
        ) {
            return res.status(400).json({
                success: false,
                message: `${train.name} does not run on ${journeyDate}.`
            });
        }

        const trainClasses = (train.classes || [])
            .map((trainClass) => ({
                code: String(trainClass.code || "").trim().toUpperCase(),
                name: trainClass.name,
                totalSeats: Number(trainClass.totalSeats || 0)
            }))
            .filter((trainClass) => trainClass.code && trainClass.totalSeats > 0);

        if (trainClasses.length === 0) {
            return res.status(400).json({
                success: false,
                message: "This train does not have any classes with seats configured."
            });
        }

        const unsupportedClass = trainClasses.find((trainClass) => !getCoachConfig(trainClass.code));

        if (unsupportedClass) {
            return res.status(400).json({
                success: false,
                message: `${unsupportedClass.code} is not supported by the coach layout system.`
            });
        }

        let inventory = await Seat.findOne({
            trainId,
            journeyDate: dateFilter
        });

        let alreadyReleased = Boolean(inventory);

        if (!inventory) {
            const availability = {};
            const bookedSeats = {};
            const waitlist = {};

            trainClasses.forEach((trainClass) => {
                availability[trainClass.code] = trainClass.totalSeats;
                bookedSeats[trainClass.code] = [];
                waitlist[trainClass.code] = 0;
            });

            try {
                inventory = await Seat.create({
                    trainId,
                    journeyDate: storedJourneyDate,
                    availability,
                    bookedSeats,
                    waitlist
                });
            } catch (error) {
                if (error.code !== 11000) throw error;

                inventory = await Seat.findOne({
                    trainId,
                    journeyDate: dateFilter
                });
                alreadyReleased = true;
            }
        }

        await Promise.all(
            trainClasses.map((trainClass) =>
                ensureCoachesForJourney({
                    trainId,
                    journeyDate,
                    classCode: trainClass.code
                })
            )
        );

        const [freshInventory, coachSummary] = await Promise.all([
            Seat.findById(inventory._id).lean(),
            getCoachSummary({ trainId, journeyDate, trainClasses })
        ]);

        if (!alreadyReleased) {
            AdminAuditLog.create({
                adminId: req.admin?._id,
                action: "SEATS_RELEASED",
                ip: req.ip,
                userAgent: req.get("user-agent"),
                reason: `${train.trainNumber} ${train.name} on ${journeyDate}`
            }).catch(() => { });
        }

        return res.status(alreadyReleased ? 200 : 201).json({
            success: true,
            alreadyReleased,
            message: alreadyReleased
                ? "Seat inventory was already released for this journey date."
                : "Seats released successfully for this journey date.",
            train: {
                id: train._id,
                trainNumber: train.trainNumber,
                name: train.name,
                source: train.source,
                destination: train.destination
            },
            journeyDate,
            classes: getClassAvailability(freshInventory, trainClasses).map((item) => ({
                ...item,
                coachCount: coachSummary.find((coach) => coach.code === item.code)?.coachCount || 0,
                releasedSeats: coachSummary.find((coach) => coach.code === item.code)?.seatCount || 0
            }))
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/*
|--------------------------------------------------------------------------
| Book Seats
|--------------------------------------------------------------------------
*/

const bookSeat = async (req, res) => {
    try {

        const {
            trainId,
            journeyDate,
            classCode,
            selectedSeats
        } = req.body;
        const dateFilter = getDateFilterOrRespond(journeyDate, res);

        if (!dateFilter) return;

        const seatInventory = await Seat.findOne({
            trainId,
            journeyDate: dateFilter
        });

        if (!seatInventory) {
            return res.status(404).json({
                success: false,
                message: "Seat inventory not found"
            });
        }

        const bookedSeats =
            seatInventory.bookedSeats.get(classCode) || [];

        const alreadyBooked = selectedSeats.filter(
            seat => bookedSeats.includes(seat)
        );

        if (alreadyBooked.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Some seats already booked",
                seats: alreadyBooked
            });
        }

        const availableSeats =
            seatInventory.availability.get(classCode) || 0;

        if (selectedSeats.length > availableSeats) {
            return res.status(400).json({
                success: false,
                message: "Not enough seats available"
            });
        }

        seatInventory.bookedSeats.set(
            classCode,
            [...bookedSeats, ...selectedSeats]
        );

        seatInventory.availability.set(
            classCode,
            availableSeats - selectedSeats.length
        );

        await seatInventory.save();

        res.status(200).json({
            success: true,
            message: "Seats booked successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

/*
|--------------------------------------------------------------------------
| Cancel Seats
|--------------------------------------------------------------------------
*/

const cancelSeat = async (req, res) => {
    try {

        const {
            trainId,
            journeyDate,
            classCode,
            seatNumbers
        } = req.body;
        const dateFilter = getDateFilterOrRespond(journeyDate, res);

        if (!dateFilter) return;

        const seatInventory = await Seat.findOne({
            trainId,
            journeyDate: dateFilter
        });

        if (!seatInventory) {
            return res.status(404).json({
                success: false,
                message: "Seat inventory not found"
            });
        }

        const bookedSeats =
            seatInventory.bookedSeats.get(classCode) || [];
        const cancelledSeats = bookedSeats.filter(
            seat => seatNumbers.includes(seat)
        );

        seatInventory.bookedSeats.set(
            classCode,
            bookedSeats.filter(
                seat => !seatNumbers.includes(seat)
            )
        );

        seatInventory.availability.set(
            classCode,
            (seatInventory.availability.get(classCode) || 0) +
            cancelledSeats.length
        );

        await seatInventory.save();

        res.status(200).json({
            success: true,
            message: "Seats cancelled successfully"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
};

module.exports = {
    getSeatMap,
    getCoachSeatMap,
    getSeatAvailability,
    releaseJourneySeats,
    bookSeat,
    cancelSeat
};