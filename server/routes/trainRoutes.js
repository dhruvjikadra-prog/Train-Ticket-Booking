const express = require("express");

const router = express.Router();

const {
    createTrain,
    searchTrains,
    getTrainById,
    getTrainSuggestions,
    getTrainSchedule,
    getAllTrains,
    updateTrain,
    deleteTrain
} = require("../controllers/trainControllers");
const { verifyCsrf } = require("../middleware/csrf");
const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");


router.post("/", requireAdminAuth, verifyCsrf, createTrain);

router.get("/suggestions", getTrainSuggestions);

router.get("/search", searchTrains);

router.get("/schedule", getTrainSchedule);

router.get("/", requireAdminAuth, getAllTrains);

router.get("/:id", getTrainById);
router.put("/:id", requireAdminAuth, verifyCsrf, updateTrain);
router.delete("/:id", requireAdminAuth, verifyCsrf, deleteTrain);

module.exports = router;
