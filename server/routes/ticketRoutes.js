const express = require("express");
const { getETicket } = require("../controllers/ticketControllers");

const router = express.Router();

router.get("/:identifier", getETicket);

module.exports = router;
