const express = require("express");
const router = express.Router();

const { sendMessage, healthCheck } = require("../controllers/chatbotControllers");
const { optionalAuth } = require("../middleware/chatbotAuth");
const { chatbotRateLimiter } = require("../middleware/chatbotRateLimiter");

// optionalAuth must run before chatbotRateLimiter so the limiter can grant
// authenticated users a higher allowance.
router.post("/message", optionalAuth, chatbotRateLimiter, sendMessage);
router.get("/health", healthCheck);

module.exports = router;