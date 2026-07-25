const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    logger: true,
    debug: true,
});

transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP Verify Error:", error);
    } else {
        console.log("SMTP Server Ready");
    }
});

const sendEmail = async ({
    to,
    subject,
    html,
    attachments = []
}) => {
    try {
        const info = await transporter.sendMail({
            from: `"RailGo" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
            attachments,
        });

        console.log("Email Sent:", info.messageId);
        return info;

    } catch (err) {
        console.error("Email Error:", err);
        throw err;
    }
};

module.exports = sendEmail;