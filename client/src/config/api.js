const apiOrigin = (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/+$/, "");

export const API_BASE_URL = `${apiOrigin}/api`;

export default API_BASE_URL;
