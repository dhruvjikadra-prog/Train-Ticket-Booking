const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET || "Train_Booking_Secret",
        {
            expiresIn: "7d"
        }
    );
};

module.exports = generateToken;
