const express = require("express");

const controller = require("../controllers/adminAuthController");
const { loginValidationRules, handleValidation } = require("../middleware/validateLogin");
const { loginLimiter, loginSlowDown } = require("../middleware/rateLimiter");
const { verifyCsrf } = require("../middleware/csrf");
const { requireAdminAuth } = require("../middleware/adminAuthMiddleware");

const router = express.Router();

router.get("/csrf-token", controller.getCsrfToken);
router.get("/captcha", controller.getCaptcha);

router.post(
    "/login",
    loginLimiter,
    loginSlowDown,
    verifyCsrf,
    loginValidationRules,
    handleValidation,
    controller.login
);

router.post("/verify-otp", loginLimiter, verifyCsrf, controller.verifyOtp);
router.post("/refresh", controller.refresh);

router.use(requireAdminAuth);

router.get("/me", controller.me);
router.post("/logout", verifyCsrf, controller.logout);
router.post("/logout-all", verifyCsrf, controller.logoutAllSessions);
router.post("/change-password", verifyCsrf, controller.changePassword);

module.exports = router;
