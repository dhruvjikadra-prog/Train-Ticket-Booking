const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const buildETicket = require("../utils/buildETicket");

const isCompletedBooking = (booking) =>
    ["payment_success", "completed"].includes(booking.bookingStatus) ||
    booking.status === "confirmed";

const getETicket = async (req, res) => {
    try {
        const { identifier } = req.params;
        const booking = await Booking.findOne({
            $or: [
                { bookingToken: identifier },
                { pnrNumber: identifier }
            ]
        })
            .populate("trainId", "name trainNumber")
            .lean();

        if (!booking) {
            return res.status(404).json({
                message: "E-ticket not found."
            });
        }

        if (booking.cancellationStatus === "FULLY_CANCELLED") {
            return res.status(409).json({
                message: "This ticket has been fully cancelled."
            });
        }

        if (!isCompletedBooking(booking) || !booking.pnrNumber || !booking.paymentId) {
            return res.status(409).json({
                message:
                    "The e-ticket is available only after successful payment."
            });
        }

        const payment = await Payment.findById(
            booking.paymentId
        ).lean();

        return res.status(200).json({
            eTicket: buildETicket(booking, payment)
        });
    } catch (error) {
        console.error("getETicket error:", error);
        return res.status(500).json({
            message: "Unable to generate the e-ticket."
        });
    }
};

module.exports = { getETicket };
