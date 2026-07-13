const crypto = require("crypto");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const Seat = require("../models/Seat");
const buildETicket = require("../utils/buildETicket");
const generatePnr = require("../utils/generatePnr");
const { buildJourneyDateFilter } = require("../utils/journeyDate");
const {
    confirmHeldSeatsForBooking,
    rollbackBookedSeatsForBooking,
    releaseSeatsForBooking
} = require("../services/coachService");

const sendEmail = require("../services/emailService");
const bookingSuccessTemplate = require("../templates/bookingSuccess");

const SUPPORTED_METHODS = [
    "UPI",
    "CARD",
    "NETBANKING",
    "WALLET"
];

const PAYMENT_READY_STATUSES = [
    "seat_selected",
    "review_completed"
];

const generateTransactionId = () =>
    `TXN${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const getBookingLifecycleStatus = (booking) => {
    if (booking.bookingStatus) return booking.bookingStatus;
    if (booking.status === "confirmed") return "completed";
    if (booking.status === "seats_selected") return "seat_selected";
    return booking.status || "pending";
};

const isPaymentReady = (booking) => {
    const lifecycleStatus = getBookingLifecycleStatus(booking);

    return (
        PAYMENT_READY_STATUSES.includes(lifecycleStatus) ||
        booking.status === "seats_selected"
    );
};

const isCompletedBooking = (booking) =>
    ["payment_success", "completed"].includes(getBookingLifecycleStatus(booking)) ||
    booking.status === "confirmed";

const isFullyCancelled = (booking) =>
    booking.cancellationStatus === "FULLY_CANCELLED" ||
    booking.status === "cancelled";

// RAC/WL bookings skipped Seat Selection (no seats were available), so
// there is nothing to confirm/rollback in the coach inventory for them.
const hasHeldSeatsToConfirm = (booking) =>
    (booking.bookingType || "CONFIRMED") === "CONFIRMED" &&
    Array.isArray(booking.selectedSeats) &&
    booking.selectedSeats.length > 0;

// CONFIRMED bookings are CNF once paid; RAC/WL bookings keep their RAC/WL
// reservation status even after payment, until a seat is later allotted.
const confirmedReservationStatus = (booking) => {
    const bookingType = booking.bookingType || "CONFIRMED";
    if (bookingType === "RAC") return "RAC";
    if (bookingType === "WL") return "WL";
    return "CNF";
};

// When a paid booking has WL passenger(s) — a whole booking of bookingType
// "WL", or a CONFIRMED booking where some passengers ended up WL because
// seats ran short at seat-selection time — record their slot(s) against
// that train/date/class's waitlist counter. Always counts actual WL
// passengers (not a flat "+1 per booking"), so it stays in sync with
// decrementWaitlistCounter (bookingCancellationService.js), which also
// counts per-passenger. This is best-effort bookkeeping and must never
// block the payment itself.
const incrementWaitlistCounter = async (booking) => {
    const incrementBy = booking.passengers.filter(
        (passenger) => passenger.reservationStatus === "WL"
    ).length;

    if (incrementBy <= 0) return;

    try {
        const journeyDateFilter = buildJourneyDateFilter(booking.journeyDate);
        if (!journeyDateFilter) return;

        await Seat.findOneAndUpdate(
            {
                trainId: booking.trainId,
                journeyDate: journeyDateFilter
            },
            {
                $inc: { [`waitlist.${booking.classCode}`]: incrementBy }
            }
        );
    } catch (waitlistError) {
        console.error("incrementWaitlistCounter error:", waitlistError);
    }
};

const sanitizePaymentDetails = (paymentMethod, details = {}) => {
    if (paymentMethod === "UPI") {
        const upiId = String(details.upiId || "").trim();

        if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) {
            throw new Error("A valid UPI ID is required.");
        }

        return { upiId };
    }

    if (paymentMethod === "CARD") {
        const cardLast4 = String(details.last4 || "").trim();
        const cardBrand = String(details.brand || "").trim();
        const nameOnCard = String(details.nameOnCard || "").trim();

        if (!/^\d{4}$/.test(cardLast4)) {
            throw new Error("Valid card last four digits are required.");
        }

        if (!cardBrand || !nameOnCard) {
            throw new Error("Card brand and cardholder name are required.");
        }

        return {
            cardBrand,
            cardLast4,
            nameOnCard
        };
    }

    if (paymentMethod === "NETBANKING") {
        const bankName = String(details.bankName || "").trim();
        const ifscCode = String(details.ifscCode || "").trim().toUpperCase();
        const accountHolderName = String(details.accountHolder || "").trim();
        const accountNumber = String(details.accountNumber || "").trim();

        if (!bankName) {
            throw new Error("A bank is required for net banking.");
        }

        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
            throw new Error("A valid IFSC code is required for net banking.");
        }

        if (!accountHolderName || accountHolderName.length < 3) {
            throw new Error("A valid account holder name is required for net banking.");
        }

        if (!/^\d{9,18}$/.test(accountNumber)) {
            throw new Error("A valid account number is required for net banking.");
        }

        // Never persist the full account number — only the last 4 digits,
        // the same masking already applied to card numbers below.
        return {
            bankName,
            ifscCode,
            accountHolder: accountHolderName,
            accountNumber: accountNumber
        };
    }

    if (paymentMethod === "WALLET") {
        const walletName = String(details.wallet || "").trim();
        const walletMobile = String(details.mobile || "").trim();

        if (!walletName || !/^\d{10}$/.test(walletMobile)) {
            throw new Error(
                "A wallet and valid 10-digit mobile number are required."
            );
        }

        return { walletName, walletMobile };
    }

    throw new Error("Unsupported payment method.");
};

const expireBookingBeforePayment = async (booking) => {
    const selectedSeats = (booking.selectedSeats || []).filter(Boolean);

    if (selectedSeats.length > 0) {
        await releaseSeatsForBooking(booking, selectedSeats);
    }

    booking.passengers = booking.passengers.map((passenger) => {
        const plainPassenger = passenger.toObject
            ? passenger.toObject()
            : passenger;

        return {
            ...plainPassenger,
            cancelledSeatNumber:
                plainPassenger.cancelledSeatNumber ||
                plainPassenger.seatNumber,
            seatNumber: null,
            reservationStatus: "CAN",
            status: "CANCELLED",
            cancellationReason: "Booking expired before payment."
        };
    });

    booking.selectedSeats = [];
    booking.bookingStatus = "expired";
    booking.status = "expired";
    booking.reservationStatus = "CAN";
    booking.cancellationStatus = "FULLY_CANCELLED";
    booking.paymentProcessingStartedAt = null;
    booking.expiresAt = null;

    if (booking.paymentStatus === "processing") {
        booking.paymentStatus = "failed";
    }

    await booking.save();
};

const getConfirmedPaymentResponse = async (booking) => {
    const [populatedBooking, payment] = await Promise.all([
        Booking.findById(booking._id)
            .populate("trainId", "name trainNumber")
            .lean(),
        Payment.findById(booking.paymentId).lean()
    ]);

    return {
        message: "Payment was already completed for this booking.",
        payment,
        booking: populatedBooking,
        eTicket: buildETicket(populatedBooking, payment)
    };
};

const createPayment = async (req, res) => {
    let payment = null;
    let lockedBooking = null;
    let seatConfirmation = null;
    let bookingConfirmed = false;

    try {
        const {
            bookingToken,
            amount,
            paymentDetails,
            gatewayPaymentId,
            gatewayStatus
        } = req.body;
        const paymentMethod = String(
            req.body.paymentMethod || ""
        ).toUpperCase();

        if (!bookingToken) {
            return res.status(400).json({
                message: "Booking token is required."
            });
        }

        if (!SUPPORTED_METHODS.includes(paymentMethod)) {
            return res.status(400).json({
                message: "Unsupported payment method."
            });
        }

        let booking = await Booking.findOne({ bookingToken });

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found."
            });
        }

        if (isCompletedBooking(booking) && booking.paymentId) {
            return res.status(200).json(
                await getConfirmedPaymentResponse(booking)
            );
        }

        if (isFullyCancelled(booking)) {
            return res.status(409).json({
                message: "A cancelled booking cannot be paid."
            });
        }

        if (booking.expiresAt && new Date() > booking.expiresAt) {
            await expireBookingBeforePayment(booking);
            return res.status(410).json({
                message: "Booking session has expired."
            });
        }

        if (
            Number.isFinite(Number(amount)) &&
            Number(amount) !== Number(booking.totalFare)
        ) {
            return res.status(400).json({
                message:
                    "Payment amount does not match the booking total."
            });
        }

        const safePaymentDetails = sanitizePaymentDetails(
            paymentMethod,
            paymentDetails
        );

        if (
            getBookingLifecycleStatus(booking) === "payment_processing" &&
            booking.paymentProcessingStartedAt &&
            Date.now() - booking.paymentProcessingStartedAt.getTime() >
            2 * 60 * 1000
        ) {
            await Booking.updateOne(
                {
                    _id: booking._id,
                    bookingStatus: "payment_processing",
                    paymentId: null
                },
                {
                    $set: {
                        bookingStatus: "review_completed",
                        status: "review_completed",
                        paymentStatus: "failed",
                        paymentProcessingStartedAt: null
                    }
                }
            );
            booking = await Booking.findById(booking._id);
        }

        if (!isPaymentReady(booking)) {
            return res.status(409).json({
                message:
                    "This booking is not ready for payment or another payment is being processed."
            });
        }

        lockedBooking = await Booking.findOneAndUpdate(
            {
                _id: booking._id,
                paymentId: null,
                cancellationStatus: { $ne: "FULLY_CANCELLED" },
                $or: [
                    { bookingStatus: { $in: PAYMENT_READY_STATUSES } },
                    { status: { $in: ["seats_selected", "seat_selected", "review_completed"] } }
                ]
            },
            {
                $set: {
                    bookingStatus: "payment_processing",
                    status: "payment_processing",
                    paymentStatus: "processing",
                    paymentProcessingStartedAt: new Date()
                }
            },
            { returnDocument: "after" }
        );

        if (!lockedBooking) {
            const currentBooking = await Booking.findById(booking._id);

            if (
                currentBooking &&
                isCompletedBooking(currentBooking) &&
                currentBooking.paymentId
            ) {
                return res.status(200).json(
                    await getConfirmedPaymentResponse(currentBooking)
                );
            }

            return res.status(409).json({
                message:
                    "This booking is not ready for payment or another payment is being processed."
            });
        }

        payment = await Payment.create({
            bookingId: lockedBooking._id,
            bookingToken: lockedBooking.bookingToken,
            transactionId: generateTransactionId(),
            gatewayPaymentId:
                String(gatewayPaymentId || "").trim() || null,
            paymentMethod,
            paymentDetails: safePaymentDetails,
            amount: lockedBooking.totalFare,
            currency: "INR",
            status: "INITIATED",
            gatewayStatus:
                String(gatewayStatus || "SUCCESS").trim()
        });

        if (hasHeldSeatsToConfirm(lockedBooking)) {
            seatConfirmation =
                await confirmHeldSeatsForBooking(lockedBooking);
        }

        const paidAt = new Date();
        const pnrNumber = await generatePnr();
        const reservationStatusAfterPayment =
            confirmedReservationStatus(lockedBooking);

        // A CONFIRMED booking can still have a mix of CNF/WL passengers
        // (seats ran short at seat-selection time). In that case each
        // passenger's reservationStatus was already set correctly during
        // seat selection, so we must not blanket-overwrite it here — doing
        // so would wrongly turn the waitlisted passenger(s) into CNF (or
        // vice versa). We only apply the uniform status when every
        // passenger already shares it (plain CNF, RAC, or WL bookings).
        const hasMixedReservationStatuses = lockedBooking.passengers.some(
            (passenger) =>
                passenger.reservationStatus !==
                lockedBooking.passengers[0].reservationStatus
        );

        const bookingLevelReservationStatus = hasMixedReservationStatuses
            ? "PARTIAL"
            : reservationStatusAfterPayment;

        const passengerSetFields = hasMixedReservationStatuses
            ? { "passengers.$[].status": "ACTIVE" }
            : {
                "passengers.$[].reservationStatus": reservationStatusAfterPayment,
                "passengers.$[].status": "ACTIVE"
            };

        const confirmedBooking = await Booking.findOneAndUpdate(
            {
                _id: lockedBooking._id,
                bookingStatus: "payment_processing",
                paymentId: null
            },
            {
                $set: {
                    bookingStatus: "completed",
                    reservationStatus: bookingLevelReservationStatus,
                    cancellationStatus: "ACTIVE",
                    status: "completed",
                    paymentStatus: "paid",
                    paymentId: payment._id,
                    paidAt,
                    pnrNumber,
                    ticketGeneratedAt: paidAt,
                    paymentProcessingStartedAt: null,
                    expiresAt: null,
                    ...passengerSetFields
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!confirmedBooking) {
            throw new Error("Booking confirmation could not be saved.");
        }

        bookingConfirmed = true;

        await incrementWaitlistCounter(confirmedBooking);

        const successfulPayment = await Payment.findByIdAndUpdate(
            payment._id,
            {
                $set: {
                    status: "SUCCESS",
                    gatewayStatus:
                        String(gatewayStatus || "SUCCESS").trim(),
                    paidAt
                }
            },
            { returnDocument: "after", runValidators: true }
        ).lean();

        const ticketBooking = await Booking.findById(
            confirmedBooking._id
        )
            .populate("trainId", "name trainNumber")
            .lean();

        const recipientEmail = ticketBooking.contact?.email;

        if (recipientEmail) {
            await sendEmail({
                to: recipientEmail,
                subject: `Ticket Confirmed - PNR ${ticketBooking.pnrNumber}`,
                html: bookingSuccessTemplate({
                    passengerName:
                        ticketBooking.passengers?.[0]?.name || "Passenger",
                    trainName:
                        ticketBooking.trainId?.name || "",
                    trainNumber:
                        ticketBooking.trainId?.trainNumber || "",
                    pnr: ticketBooking.pnrNumber,
                    from: ticketBooking.fromStation,
                    to: ticketBooking.toStation,
                    journeyDate: ticketBooking.journeyDate,
                    seatNo:
                        ticketBooking.selectedSeats?.join(", ")
                })
            });

            console.log("Booking confirmation email sent.");
        } else {
            console.log("No passenger email found.");
        }

        return res.status(201).json({
            message: "Payment successful and booking confirmed.",
            payment: successfulPayment,
            booking: ticketBooking,
            eTicket: buildETicket(ticketBooking, successfulPayment)
        });
    } catch (error) {
        console.error("createPayment error:", error);

        if (!bookingConfirmed && seatConfirmation && lockedBooking) {
            await rollbackBookedSeatsForBooking(
                lockedBooking,
                seatConfirmation.newlyBooked,
                seatConfirmation.inventorySeatCodes
            ).catch((rollbackError) => {
                console.error(
                    "payment confirmation rollback error:",
                    rollbackError
                );
            });
        }

        if (!bookingConfirmed && payment) {
            await Payment.findByIdAndUpdate(payment._id, {
                $set: {
                    status: "FAILED",
                    gatewayStatus: "FAILED",
                    failureReason: error.message,
                    failedAt: new Date()
                }
            }).catch((paymentError) => {
                console.error(
                    "failed payment update error:",
                    paymentError
                );
            });
        }

        if (!bookingConfirmed && lockedBooking) {
            await Booking.updateOne(
                {
                    _id: lockedBooking._id,
                    bookingStatus: "payment_processing",
                    paymentId: null
                },
                {
                    $set: {
                        bookingStatus: "review_completed",
                        status: "review_completed",
                        paymentStatus: "failed",
                        paymentProcessingStartedAt: null
                    }
                }
            ).catch((bookingError) => {
                console.error(
                    "payment booking reset error:",
                    bookingError
                );
            });
        }

        if (
            error.message?.includes("required") ||
            error.message?.includes("Unsupported") ||
            error.message?.includes("valid seat selection")
        ) {
            return res.status(400).json({ message: error.message });
        }

        if (
            error.message?.includes("no longer held") ||
            error.message?.includes("could not be confirmed") ||
            error.message?.includes("could not be found") ||
            error.message?.includes("availability changed") ||
            error.code === 11000
        ) {
            return res.status(409).json({
                message:
                    error.code === 11000
                        ? "This booking already has a successful payment."
                        : error.message
            });
        }

        return res.status(500).json({
            message: "Payment could not be completed. Please try again."
        });
    }
};

const getPaymentById = async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.paymentId)
            .populate(
                "bookingId",
                "bookingToken pnrNumber bookingStatus reservationStatus paymentStatus cancellationStatus status"
            )
            .lean();

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found."
            });
        }

        return res.status(200).json({ payment });
    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({
                message: "Invalid payment ID."
            });
        }

        return res.status(500).json({
            message: "Unable to load payment."
        });
    }
};

const getPaymentsByBookingToken = async (req, res) => {
    try {
        const payments = await Payment.find({
            bookingToken: req.params.bookingToken
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            count: payments.length,
            payments
        });
    } catch (error) {
        return res.status(500).json({
            message: "Unable to load booking payments."
        });
    }
};

module.exports = {
    createPayment,
    getPaymentById,
    getPaymentsByBookingToken
};