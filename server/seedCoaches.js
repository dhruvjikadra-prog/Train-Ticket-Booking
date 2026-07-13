require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const SeatInventory = require("./models/Seat");
const { getCoachConfig } = require("./utils/coachLayout");
const { ensureCoachesForJourney } = require("./services/coachService");

const seedCoaches = async () => {
    await connectDB();

    const inventories = await SeatInventory.find({})
        .select("trainId journeyDate availability")
        .lean();

    let coachCount = 0;

    for (const inventory of inventories) {
        const journeyDate = inventory.journeyDate.toISOString().slice(0, 10);
        const availability = inventory.availability instanceof Map
            ? Object.fromEntries(inventory.availability)
            : inventory.availability || {};

        for (const classCode of Object.keys(availability)) {
            if (!getCoachConfig(classCode)) continue;

            const coaches = await ensureCoachesForJourney({
                trainId: inventory.trainId,
                journeyDate,
                classCode
            });

            coachCount += coaches.length;
            console.log(
                `${journeyDate} ${classCode}: ${coaches.length} coach(es)`
            );
        }
    }

    console.log(`Coach initialization complete: ${coachCount} coach documents.`);
    await mongoose.disconnect();
};

seedCoaches().catch(async (error) => {
    console.error("Coach initialization failed:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
