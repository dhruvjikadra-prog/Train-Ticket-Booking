const express = require("express");
const router = express.Router();

const {
    getPaymentsReport,
    getPaymentReportById,
    exportPaymentsCsv
} = require("../controllers/adminPaymentControllers");

const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");

// Every route below requires a valid admin session. Nothing here is reachable
// without it — this is the security boundary for the whole report surface.
router.use(requireAdminAuth);

// NOTE: /export must be registered before /:id, otherwise Express will treat
// "export" as an :id value and it'll get routed to getPaymentReportById.
router.get("/export", exportPaymentsCsv);
router.get("/", getPaymentsReport);
router.get("/:id", getPaymentReportById);

module.exports = router;

// Mount this in your main routes file alongside adminBookingRoutes, e.g.:
//   app.use("/api/admin/payments", require("./routes/adminPaymentRoutes"));