const crypto = require("crypto");
const Booking = require("../models/Booking");

const generatePnr = async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
        // Indian railway PNRs are conventionally represented as 10 digits.
        const pnrNumber = crypto.randomInt(
            1000000000,
            9999999999
        ).toString();

        if (!await Booking.exists({ pnrNumber })) {
            return pnrNumber;
        }
    }

    throw new Error("Unable to generate a unique PNR number.");
};

module.exports = generatePnr;
