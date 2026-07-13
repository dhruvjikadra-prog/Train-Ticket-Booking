const { body, validationResult } = require("express-validator");

const loginValidationRules = [
    body("email")
        .trim()
        .toLowerCase()
        .isEmail()
        .withMessage("Enter a valid email address.")
        .isLength({ max: 254 }),

    body("password")
        .isString()
        .withMessage("Invalid credentials.")
        .isLength({ min: 1, max: 128 })
        .withMessage("Invalid credentials."),

    body("captchaToken").isString().notEmpty().withMessage("Verification expired. Refresh and try again."),
    body("captchaAnswer").exists().withMessage("Please answer the verification question."),

    body("website").custom((value) => {
        if (value) throw new Error("Request rejected.");
        return true;
    })
];

function handleValidation(req, res, next) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: "Invalid credentials.",
            errors: errors.array().map((error) => error.msg)
        });
    }

    next();
}

module.exports = { loginValidationRules, handleValidation };
