const User = require("../models/Users");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");

const MOBILE_PATTERN = /^[6-9]\d{9}$/;

const toSafeUser = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile || null,
    role: user.role
});

exports.signup = async (req, res) => {
    
    try {
        const { name, password } = req.body;
        const email = String(req.body.email || "").trim().toLowerCase();
        const mobile = String(req.body.mobile || req.body.phone || "").trim();

        if (!MOBILE_PATTERN.test(mobile)) {
            return res.status(400).json({
                message: "Enter a valid 10-digit mobile number"
            });
        }

        const userExists = await User.findOne({
            $or: [{ email }, { mobile }]
        });

        if (userExists) {
            const duplicateField = userExists.email === email ? "Email" : "Mobile number";
            return res.status(400).json({
                message: `${duplicateField} Already Exists`
            });
        }

        const hashPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            mobile,
            password: hashPassword
        });

        res.status(201).json({
            message: "Signup Suceess",
            token: generateToken(user._id),
            user: toSafeUser(user)
        });

    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || "field";
            return res.status(400).json({
                message: `${field === "mobile" ? "Mobile number" : "Email"} Already Exists`
            });
        }

        res.status(500).json({
            message: error.message
        });
    }
};

exports.login = async (req, res) => {

    try {

        const { email, password } = req.body;

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res.status(400).json({
                message: "Invalid Credentials"
            });
        }

        const match =
            await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({
                message: "Invalid Credentials"
            });
        }

        res.json({
            token: generateToken(user._id),
            user: toSafeUser(user)
        });

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }
};
