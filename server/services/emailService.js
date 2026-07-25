const axios = require("axios");

const sendEmail = async ({
    to,
    subject,
    html,
    attachments = []
}) => {
    const payload = {
        sender: {
            name: "RailGo",
            email: process.env.BREVO_SENDER_EMAIL,
        },

        to: [
            {
                email: to,
            },
        ],

        subject,
        htmlContent: html,

        attachment: attachments.map(file => ({
            name: file.filename,
            content: Buffer.isBuffer(file.content)
                ? file.content.toString("base64")
                : file.content
        }))
    };

    try {
        const response = await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            payload,
            {
                headers: {
                    "api-key": process.env.BREVO_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                }
            }
        );

        return response.data;
    } catch (err) {
        console.error(
            "Brevo Error:",
            err.response?.data || err.message
        );
        throw err;
    }
};

module.exports = sendEmail;