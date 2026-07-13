const express = require("express");
const router = express.Router();
const {
    createBooking,
    getBookingByToken,
    updateSelectedSeats,
    completeReview,
    getAllBookings
} = require("../controllers/bookingControllers");

router.post("/", createBooking);
router.get("/:token", getBookingByToken);
router.patch("/:token/seats", updateSelectedSeats);
router.patch("/:token/review", completeReview);
router.get("/", getAllBookings);   // admin/debug route

module.exports = router;
