const express = require("express");
const {
    createPayment,
    getPaymentById,
    getPaymentsByBookingToken
} = require("../controllers/paymentControllers");

const router = express.Router();

router.post("/create", createPayment);
router.get("/booking/:bookingToken", getPaymentsByBookingToken);
router.get("/:paymentId", getPaymentById);

module.exports = router;
