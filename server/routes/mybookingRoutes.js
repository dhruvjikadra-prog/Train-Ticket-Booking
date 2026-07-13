const express = require("express");
const router = express.Router();

const {
    getBookingHistory,
    getBookingByToken,
    getBookingById,
    cancelBooking
} = require("../controllers/mybookingControllers");

const { verifyToken } = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/history", getBookingHistory);
router.get("/token/:token", getBookingByToken);
router.patch("/token/:token/cancel", cancelBooking);
router.get("/:id", getBookingById);

module.exports = router;
