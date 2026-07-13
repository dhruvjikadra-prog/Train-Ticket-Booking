const mongoose = require('mongoose');

const connectDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1/Train_Booking");

        console.log("Database Connected Successfully");

    } catch(error) {
        console.log(error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
