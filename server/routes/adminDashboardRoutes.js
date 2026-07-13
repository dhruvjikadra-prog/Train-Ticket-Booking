const express = require("express");

const { getOverview } = require("../controllers/adminDashboardController");
const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/overview", getOverview);

module.exports = router;
