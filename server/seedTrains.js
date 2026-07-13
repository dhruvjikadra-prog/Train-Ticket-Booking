require("dotenv").config();

const connectDB = require("./config/db");
const Train = require("./models/Train");

const trains = [
    {
        trainNumber: "12951",
        name: "Mumbai Rajdhani Express",
        from: "New Delhi",
        to: "Mumbai Central",
        departureTime: "16:55",
        arrivalTime: "08:35",
        duration: "15h 40m",
        distance: 1384,
        runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        classes: ["AC 3 Tier", "AC 2 Tier", "First AC"],
        fare: {
            sleeper: 0,
            ac3: 2480,
            ac2: 3560,
            firstAc: 5875
        },
        seatAvailability: {
            ac3: 74,
            ac2: 35,
            firstAc: 15
        },
        rating: 4.7
    },
    {
        trainNumber: "12953",
        name: "August Kranti Rajdhani",
        from: "New Delhi",
        to: "Mumbai Central",
        departureTime: "17:15",
        arrivalTime: "09:45",
        duration: "16h 30m",
        distance: 1378,
        runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        classes: ["AC 3 Tier", "AC 2 Tier", "First AC"],
        fare: {
            sleeper: 0,
            ac3: 2325,
            ac2: 3420,
            firstAc: 5690
        },
        seatAvailability: {
            ac3: 54,
            ac2: 24,
            firstAc: 8
        },
        rating: 4.5
    },
    {
        trainNumber: "12295",
        name: "Sanghamitra Express",
        from: "Bengaluru City Junction",
        to: "New Delhi",
        departureTime: "09:15",
        arrivalTime: "20:05",
        duration: "34h 50m",
        distance: 2365,
        runningDays: ["Mon", "Wed", "Fri", "Sun"],
        classes: ["Sleeper", "AC 3 Tier", "AC 2 Tier"],
        fare: {
            sleeper: 840,
            ac3: 2240,
            ac2: 3230,
            firstAc: 0
        },
        seatAvailability: {
            sleeper: 147,
            ac3: 52,
            ac2: 12
        },
        rating: 4.1
    },
    {
        trainNumber: "12002",
        name: "New Delhi Shatabdi Express",
        from: "New Delhi",
        to: "Kanpur Central",
        departureTime: "06:00",
        arrivalTime: "11:20",
        duration: "5h 20m",
        distance: 440,
        runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        classes: ["AC Chair Car", "Executive Chair Car"],
        fare: {
            sleeper: 0,
            ac3: 995,
            ac2: 0,
            firstAc: 0
        },
        seatAvailability: {
            acChairCar: 39,
            executiveChairCar: 9
        },
        rating: 4.4
    },
    {
        trainNumber: "22917",
        name: "Haridwar Superfast Express",
        from: "Ahmedabad Junction",
        to: "New Delhi",
        departureTime: "10:05",
        arrivalTime: "03:40",
        duration: "17h 35m",
        distance: 934,
        runningDays: ["Tue", "Fri", "Sun"],
        classes: ["Sleeper", "AC 3 Tier", "AC 2 Tier"],
        fare: {
            sleeper: 455,
            ac3: 1215,
            ac2: 1785,
            firstAc: 0
        },
        seatAvailability: {
            sleeper: 108,
            ac3: 44,
            ac2: 11
        },
        rating: 4.0
    },
    {
        trainNumber: "12933",
        name: "Karnavati Express",
        from: "Mumbai Central",
        to: "Ahmedabad Junction",
        departureTime: "14:05",
        arrivalTime: "21:25",
        duration: "7h 20m",
        distance: 491,
        runningDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        classes: ["Sleeper", "AC Chair Car", "AC 3 Tier"],
        fare: {
            sleeper: 245,
            ac3: 790,
            ac2: 0,
            firstAc: 0
        },
        seatAvailability: {
            sleeper: 47,
            acChairCar: 30,
            ac3: 15
        },
        rating: 4.2
    }
];

const seedTrains = async () => {
    try {
        await connectDB();

        await Train.deleteMany({});
        await Train.insertMany(trains);

        console.log("Train data seeded successfully");
        process.exit(0);
    } catch (error) {
        console.log(error.message);
        process.exit(1);
    }
};

seedTrains();
