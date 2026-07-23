const mongoose = require('mongoose');

const savedPassengerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 60
        },
        age: {
            type: Number,
            required: true,
            min: 1,
            max: 120
        },
        gender: {
            type: String,
            required: true,
            enum: ["Male", "Female", "Other"]
        },
        seniorCitizen: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        },

        // Optional for old accounts, but unique whenever it is set.
        // Keep it absent instead of null so sparse uniqueness works correctly.
        mobile: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
            match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"]
        },

        password: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: String,
            default: "user"
        },

        savedPassengers: {
            type: [savedPassengerSchema],
            default: [],
            validate: {
                validator(passengers) {
                    return passengers.length <= 12;
                },
                message: "You can save up to 12 passengers."
            }
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);
