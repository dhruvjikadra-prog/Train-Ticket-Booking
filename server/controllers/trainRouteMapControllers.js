const TrainRouteMap = require("../models/TrainRouteMap");

// Get Route by Train Number
const getTrainRouteMap = async (req, res) => {
    try {
        const { trainNumber } = req.params;

        const route = await TrainRouteMap.findOne({ trainNumber });

        if (!route) {
            return res.status(404).json({
                success: false,
                message: "Train route not found."
            });
        }

        res.status(200).json({
            success: true,
            route
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


// Get All Train Routes
const getAllTrainRoutes = async (req, res) => {
    try {
        const routes = await TrainRouteMap.find().sort({
            trainNumber: 1
        });

        res.status(200).json({
            success: true,
            total: routes.length,
            routes
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


// Create Route
const createTrainRouteMap = async (req, res) => {
    try {

        const {
            trainNumber,
            trainName,
            stations,
            polyline,
            bounds
        } = req.body;

        const exists = await TrainRouteMap.findOne({ trainNumber });

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Route already exists."
            });
        }

        const route = await TrainRouteMap.create({
            trainNumber,
            trainName,
            stations,
            polyline,
            bounds
        });

        res.status(201).json({
            success: true,
            message: "Route created successfully.",
            route
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


// Update Route
const updateTrainRouteMap = async (req, res) => {
    try {

        const { trainNumber } = req.params;

        const route = await TrainRouteMap.findOneAndUpdate(
            { trainNumber },
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!route) {
            return res.status(404).json({
                success: false,
                message: "Route not found."
            });
        }

        res.status(200).json({
            success: true,
            message: "Route updated successfully.",
            route
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


// Delete Route
const deleteTrainRouteMap = async (req, res) => {
    try {

        const { trainNumber } = req.params;

        const route = await TrainRouteMap.findOneAndDelete({
            trainNumber
        });

        if (!route) {
            return res.status(404).json({
                success: false,
                message: "Route not found."
            });
        }

        res.status(200).json({
            success: true,
            message: "Route deleted successfully."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


module.exports = {
    getTrainRouteMap,
    getAllTrainRoutes,
    createTrainRouteMap,
    updateTrainRouteMap,
    deleteTrainRouteMap
};