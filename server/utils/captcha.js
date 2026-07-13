const jwt = require("jsonwebtoken");

function getCaptchaSecret() {
    if (!process.env.CAPTCHA_SECRET) {
        throw new Error("CAPTCHA_SECRET is required for admin authentication.");
    }

    return process.env.CAPTCHA_SECRET;
}

function createMathCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const question = `${a} + ${b}`;

    const token = jwt.sign({ answer: a + b }, getCaptchaSecret(), {
        expiresIn: "2m"
    });

    return { question, token };
}

function verifyMathCaptcha(token, submittedAnswer) {
    if (!token || submittedAnswer === undefined || submittedAnswer === null) {
        return false;
    }

    try {
        const { answer } = jwt.verify(token, getCaptchaSecret());
        return Number(submittedAnswer) === Number(answer);
    } catch {
        return false;
    }
}

module.exports = { createMathCaptcha, verifyMathCaptcha };
