const express = require("express");

const {
    getTrainRouteMap,
    getAllTrainRoutes,
    createTrainRouteMap,
    updateTrainRouteMap,
    deleteTrainRouteMap
} = require("../controllers/trainRouteMapControllers");

const router = express.Router();

router.get("/", getAllTrainRoutes);

router.get("/:trainNumber", getTrainRouteMap);

router.post("/", createTrainRouteMap);

router.put("/:trainNumber", updateTrainRouteMap);

router.delete("/:trainNumber", deleteTrainRouteMap);

module.exports = router;