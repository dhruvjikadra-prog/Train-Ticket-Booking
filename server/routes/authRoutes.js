const express = require('express');

const router = express.Router();

const {
    signup,
    login
} = require("../controllers/authControllers");
const { loginLimiter, loginSlowDown, signupLimiter } = require("../middleware/rateLimiter");

router.post("/signup", signupLimiter, signup);

router.post("/login", loginLimiter, loginSlowDown, login);

module.exports = router;
