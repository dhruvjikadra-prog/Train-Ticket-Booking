const express = require("express");
const router = express.Router();

const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");
const {
    getStations,
    getStationById,
    createStation,
    updateStation,
    setStationStatus,
    deleteStation
} = require("../controllers/adminStationControllers");

// Every route below requires a valid admin session, same as the payments
// report routes. If you gate individual reports by admin role elsewhere
// (adminPaymentControllers.js's 403 "role doesn't include access" path
// implies a permission layer exists somewhere upstream of it), add the
// matching role check here too, e.g.:
//   router.use(requireAdminAuth, requireAdminRole("stations"));
router.use(requireAdminAuth);

router.get("/", getStations);
router.get("/:id", getStationById);
router.post("/", createStation);
router.put("/:id", updateStation);
router.patch("/:id/status", setStationStatus);
router.delete("/:id", deleteStation);

module.exports = router;