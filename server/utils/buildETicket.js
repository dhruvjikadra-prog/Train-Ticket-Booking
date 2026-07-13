const buildETicket = (booking, payment = null) => {
    const train =
        booking.trainId && typeof booking.trainId === "object"
            ? booking.trainId
            : null;

    return {
        ticketType: "E-TICKET",
        pnrNumber: booking.pnrNumber,
        bookingId: booking._id,
        bookingToken: booking.bookingToken,
        bookingStatus: booking.bookingStatus || booking.status,
        reservationStatus: booking.reservationStatus,
        cancellationStatus: booking.cancellationStatus,
        generatedAt: booking.ticketGeneratedAt,
        train: {
            id: train?._id || booking.trainId,
            number: booking.trainNo,
            name: train?.name || null
        },
        journey: {
            fromStation: booking.fromStation,
            toStation: booking.toStation,
            journeyDate: booking.journeyDate,
            classCode: booking.classCode
        },
        passengers: booking.passengers.map((passenger) => ({
            id: passenger._id,
            name: passenger.name,
            age: passenger.age,
            gender: passenger.gender,
            seatNumber: passenger.seatNumber,
            cancelledSeatNumber: passenger.cancelledSeatNumber,
            reservationStatus: passenger.reservationStatus,
            status: passenger.status,
            cancelledAt: passenger.cancelledAt
        })),
        contact: booking.contact,
        fare: {
            amount: booking.totalFare,
            currency: payment?.currency || "INR"
        },
        payment: payment
            ? {
                paymentId: payment._id,
                transactionId: payment.transactionId,
                method: payment.paymentMethod,
                status: payment.status,
                paidAt: payment.paidAt
            }
            : {
                paymentId: booking.paymentId,
                status: booking.paymentStatus,
                paidAt: booking.paidAt
            }
    };
};

module.exports = buildETicket;
