const brevo = require("@getbrevo/brevo");

const apiInstance = new brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

const sendEmail = async ({
    to,
    subject,
    html,
    attachments = []
}) => {

    const email = {
        sender: {
            name: "RailGo",
            email: "dhruvjikadra@gmail.com"
        },

        to: [
            {
                email: to
            }
        ],

        subject,

        htmlContent: html,

        attachment: attachments.map(file => ({
            name: file.filename,
            content: file.content.toString("base64")
        }))
    };

    return await apiInstance.sendTransacEmail(email);
};

module.exports = sendEmail;