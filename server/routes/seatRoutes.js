const express = require("express");

const router = express.Router();

const {
    getSeatMap,
    getCoachSeatMap,
    getSeatAvailability,
    releaseJourneySeats,
    bookSeat,
    cancelSeat
} = require("../controllers/seatControllers");
const { verifyCsrf } = require("../middleware/csrf");
const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");

router.get("/map/:trainId/:classCode", getSeatMap);
router.get("/coaches/:token", getCoachSeatMap);

router.get("/availability", getSeatAvailability);

router.post("/release-journey", requireAdminAuth, verifyCsrf, releaseJourneySeats);

router.post("/book", bookSeat);

router.post("/cancel", cancelSeat);

module.exports = router;
