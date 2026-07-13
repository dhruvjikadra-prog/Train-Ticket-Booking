const CLASS_COACH_CONFIG = {
    SL: {
        prefix: "S",
        coachType: "SLEEPER",
        layoutType: "BERTH_3_TIER",
        seatsPerCoach: 72,
        seatsPerBay: 8
    },
    "3A": {
        prefix: "B",
        coachType: "AC_3_TIER",
        layoutType: "BERTH_3_TIER",
        seatsPerCoach: 64,
        seatsPerBay: 8
    },
    "2A": {
        prefix: "A",
        coachType: "AC_2_TIER",
        layoutType: "BERTH_2_TIER",
        seatsPerCoach: 46,
        seatsPerBay: 6
    },
    "1A": {
        prefix: "H",
        coachType: "FIRST_AC",
        layoutType: "CABIN",
        seatsPerCoach: 18,
        seatsPerBay: 4
    },
    CC: {
        prefix: "C",
        coachType: "CHAIR_CAR",
        layoutType: "CHAIR_3_2",
        seatsPerCoach: 78,
        seatsPerRow: 5
    },
    EC: {
        prefix: "E",
        coachType: "EXECUTIVE_CHAIR",
        layoutType: "CHAIR_2_2",
        seatsPerCoach: 56,
        seatsPerRow: 4
    }
};

const BERTH_LAYOUTS = {
    BERTH_3_TIER: [
        ["Lower", "LB", "LEFT"],
        ["Middle", "MB", "LEFT"],
        ["Upper", "UB", "LEFT"],
        ["Lower", "LB", "RIGHT"],
        ["Middle", "MB", "RIGHT"],
        ["Upper", "UB", "RIGHT"],
        ["Side Lower", "SL", "SIDE"],
        ["Side Upper", "SU", "SIDE"]
    ],
    BERTH_2_TIER: [
        ["Lower", "LB", "LEFT"],
        ["Upper", "UB", "LEFT"],
        ["Lower", "LB", "RIGHT"],
        ["Upper", "UB", "RIGHT"],
        ["Side Lower", "SL", "SIDE"],
        ["Side Upper", "SU", "SIDE"]
    ],
    CABIN: [
        ["Lower", "LB", "LEFT"],
        ["Upper", "UB", "LEFT"],
        ["Lower", "LB", "RIGHT"],
        ["Upper", "UB", "RIGHT"]
    ]
};

const CHAIR_LAYOUTS = {
    CHAIR_3_2: [
        ["Window", "W", "LEFT"],
        ["Middle", "M", "LEFT"],
        ["Aisle", "A", "LEFT"],
        ["Aisle", "A", "RIGHT"],
        ["Window", "W", "RIGHT"]
    ],
    CHAIR_2_2: [
        ["Window", "W", "LEFT"],
        ["Aisle", "A", "LEFT"],
        ["Aisle", "A", "RIGHT"],
        ["Window", "W", "RIGHT"]
    ]
};

const getCoachConfig = (classCode) =>
    CLASS_COACH_CONFIG[(classCode || "").toUpperCase()] || null;

const isCoachAllowedForClass = (classCode, coachCode) => {
    const config = getCoachConfig(classCode);
    return Boolean(
        config &&
        new RegExp(`^${config.prefix}\\d+$`, "i").test(coachCode || "")
    );
};

const buildSeat = ({
    classCode,
    coachCode,
    seatNumber,
    status = "AVAILABLE"
}) => {
    const config = getCoachConfig(classCode);

    if (!config) {
        throw new Error(`Unsupported class code: ${classCode}`);
    }

    const layout = BERTH_LAYOUTS[config.layoutType];

    if (layout) {
        const position = (seatNumber - 1) % config.seatsPerBay;
        const [berthType, berthCode, side] = layout[position];

        return {
            seatNumber,
            seatCode: `${coachCode}-${seatNumber}`,
            berthType,
            berthCode,
            row: Math.floor((seatNumber - 1) / config.seatsPerBay) + 1,
            column: position + 1,
            side,
            status
        };
    }

    const chairLayout = CHAIR_LAYOUTS[config.layoutType];
    const position = (seatNumber - 1) % config.seatsPerRow;
    const [berthType, berthCode, side] = chairLayout[position];

    return {
        seatNumber,
        seatCode: `${coachCode}-${seatNumber}`,
        berthType,
        berthCode,
        row: Math.floor((seatNumber - 1) / config.seatsPerRow) + 1,
        column: position + 1,
        side,
        status
    };
};

module.exports = {
    CLASS_COACH_CONFIG,
    buildSeat,
    getCoachConfig,
    isCoachAllowedForClass
};
