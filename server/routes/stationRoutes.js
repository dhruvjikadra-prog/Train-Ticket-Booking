const express = require("express");

const router = express.Router();

const {
    getStationSuggestions
} = require("../controllers/stationControllers");

router.get("/suggestions", getStationSuggestions);

module.exports = router;
