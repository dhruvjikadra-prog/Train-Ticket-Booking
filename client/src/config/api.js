const apiOrigin = (process.env.REACT_APP_API_URL || "https://railgo-train-ticket-booking.onrender.com").replace(/\/+$/, "");

export const API_BASE_URL = `${apiOrigin}/api`;

export default API_BASE_URL;
