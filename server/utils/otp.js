const { authenticator } = require("otplib");
const QRCode = require("qrcode");

authenticator.options = { window: 1 };

function generateSecret() {
    return authenticator.generateSecret();
}

function getOtpAuthUrl(email, secret) {
    return authenticator.keyuri(email, "Train Ticket Booking Admin", secret);
}

async function getQrCodeDataUrl(otpAuthUrl) {
    return QRCode.toDataURL(otpAuthUrl);
}

function verifyOtpToken(token, secret) {
    if (!token || !secret) return false;

    try {
        return authenticator.verify({ token: String(token).trim(), secret });
    } catch {
        return false;
    }
}

module.exports = { generateSecret, getOtpAuthUrl, getQrCodeDataUrl, verifyOtpToken };
