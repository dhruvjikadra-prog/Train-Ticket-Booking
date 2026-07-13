const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async ({
    to,
    subject,
    html,
    attachments = []
}) => {
    if (!to) {
        throw new Error("Recipient email address is missing.");
    }

    const info = await transporter.sendMail({
        from: `"Train Ticket Booking" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        attachments
    });

    return info;
};

module.exports = sendEmail;