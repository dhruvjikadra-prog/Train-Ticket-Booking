require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");

const connectDB = require("./config/db");
const { globalLimiter } = require("./middleware/rateLimiter");

const app = express();

connectDB();

const clientOrigins = (process.env.CLIENT_ORIGIN || "https://railgo-train-ticket-booking.vercel.app/")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

app.set("trust proxy", 1);

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                frameAncestors: ["'none'"]
            }
        }
    })
);

app.use(cors({
    origin(origin, callback) {
        if (!origin || clientOrigins.includes(origin.replace(/\/+$/, ""))) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
    if (req.body) mongoSanitize.sanitize(req.body);
    if (req.params) mongoSanitize.sanitize(req.params);
    if (req.query) mongoSanitize.sanitize(req.query);
    next();
});
app.use(hpp({ checkBody: false }));
app.use(globalLimiter);

const authRoutes = require("./routes/authRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const stationRoutes = require("./routes/stationRoutes");
const trainRoutes = require("./routes/trainRoutes");
const seatRoutes = require("./routes/seatRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const mybookingRoutes = require("./routes/mybookingRoutes");
const trainMapRoutes = require("./routes/trainMapRoutes");
const adminBookingRoutes = require("./routes/adminBookingRoutes");
const pnrStatusRoutes = require("./routes/pnrStatusRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/trains", trainRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/my-bookings", mybookingRoutes);
app.use("/api/train-route-map", trainMapRoutes);
app.use("/api/admin/bookings", adminBookingRoutes);
app.use("/api/pnr-status", pnrStatusRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/admin/payments", require("./routes/adminPaymentRoutes"));
app.use("/api/admin/stations", require("./routes/adminStationRoutes"));
app.use("/api/users", require("./routes/userProfileRoutes"));

app.get("/", (req, res) => {
    res.send("Train API Running");
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server Running on Port ${PORT}`);
});
