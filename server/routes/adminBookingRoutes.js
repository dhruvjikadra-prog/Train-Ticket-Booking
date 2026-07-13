const express = require("express");
const router = express.Router();

const {
    getBookingsReport,
    getBookingReportById,
    exportBookingsCsv
} = require("../controllers/adminBookingControllers");

const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");

// Every route below requires a valid admin session. Nothing here is reachable
// without it — this is the security boundary for the whole report surface.
router.use(requireAdminAuth);

// NOTE: /export must be registered before /:id, otherwise Express will treat
// "export" as an :id value and it'll get routed to getBookingReportById.
router.get("/export", exportBookingsCsv);
router.get("/", getBookingsReport);
router.get("/:id", getBookingReportById);

module.exports = router;