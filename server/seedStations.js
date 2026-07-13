require("dotenv").config();

const connectDB = require("./config/db");
const Station = require("./models/Station");

const stations = [
    {
        name: "New Delhi",
        code: "NDLS",
        city: "New Delhi",
        state: "Delhi",
        desc: "New Delhi Railway Station"
    },
    {
        name: "Kanpur Central",
        code: "CNB",
        city: "Kanpur",
        state: "Uttar Pradesh",
        desc: "Kanpur Central Railway Station"
    },
    {
        name: "Surat",
        code: "ST",
        city: "Surat",
        state: "Gujarat",
        desc: "Surat Railway Station"
    },
    {
        name: "Ahmedabad Junction",
        code: "ADI",
        city: "Ahmedabad",
        state: "Gujarat",
        desc: "Ahmedabad Junction Railway Station"
    },
    {
        name: "Mumbai Central",
        code: "MMCT",
        city: "Mumbai",
        state: "Maharashtra",
        desc: "Mumbai Central Railway Station"
    },
    {
        name: "Chhatrapati Shivaji Maharaj Terminus",
        code: "CSMT",
        city: "Mumbai",
        state: "Maharashtra",
        desc: "CSMT Mumbai"
    },
    {
        name: "Howrah Junction",
        code: "HWH",
        city: "Howrah",
        state: "West Bengal",
        desc: "Howrah Railway Station"
    },
    {
        name: "Chennai Central",
        code: "MAS",
        city: "Chennai",
        state: "Tamil Nadu",
        desc: "Puratchi Thalaivar Dr. M.G. Ramachandran Central"
    },
    {
        name: "Bengaluru City Junction",
        code: "SBC",
        city: "Bengaluru",
        state: "Karnataka",
        desc: "Krantivira Sangolli Rayanna Railway Station"
    },
    {
        name: "Jaipur Junction",
        code: "JP",
        city: "Jaipur",
        state: "Rajasthan",
        desc: "Jaipur Railway Station"
    }
];

const seedStations = async () => {
    try {
        await connectDB();

        await Station.deleteMany({});
        await Station.insertMany(stations);

        console.log("Station data seeded successfully");
        process.exit(0);
    } catch (error) {
        console.log(error.message);
        process.exit(1);
    }
};

seedStations();
