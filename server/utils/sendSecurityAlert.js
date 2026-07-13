async function sendSecurityAlert({ admin, ip, userAgent, reason }) {
    console.warn(
        `[SECURITY ALERT] ${reason} admin=${admin?.email || "unknown"} ip=${ip} ua=${userAgent}`
    );
}

module.exports = sendSecurityAlert;
