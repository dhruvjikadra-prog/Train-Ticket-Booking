const express = require("express");

const {
    getCaptcha,
    searchByPnr
} = require("../controllers/pnrStatusControllers");
const { pnrStatusLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.get("/captcha", getCaptcha);
router.post("/search", pnrStatusLimiter, searchByPnr);

module.exports = router;
