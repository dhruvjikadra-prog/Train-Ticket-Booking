const jwt = require("jsonwebtoken");
const User = require("../models/Users");

const JWT_SECRET = process.env.JWT_SECRET || "Train_Booking_Secret";

const verifyToken = async (req, res, next) => {
    let token = req.headers.authorization;

    if (!token || !token.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    token = token.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            JWT_SECRET
        );

        const user = await User.findById(decoded.id).select("_id name email role").lean();

        if (!user) {
            return res.status(401).json({
                message: "Your session is no longer valid. Please log in again."
            });
        }

        req.user = {
            id: user._id.toString(),
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role || "user"
        };

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired session. Please log in again."
        });
    }
};

module.exports = { verifyToken };
