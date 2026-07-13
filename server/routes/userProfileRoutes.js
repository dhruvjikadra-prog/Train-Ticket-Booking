const express = require("express");
const router = express.Router();

// Assumes a user-level session-auth middleware exists elsewhere in the app
// (parallel to requireAdminAuth for the admin side) that sets req.user.id
// from the logged-in user's session/JWT. Adjust the path/name below to
// match whatever it's actually called in this codebase.

const {
    getMyProfile,
    updateMyProfile,
    changeMyPassword
} = require("../controllers/userProfileControllers");

const { verifyToken } = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);
router.put("/me/password", changeMyPassword);

module.exports = router;