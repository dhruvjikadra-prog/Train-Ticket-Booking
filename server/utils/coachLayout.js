// Class-to-coach configuration for every class this system supports.
// Coach-code prefixes follow real Indian Railways convention where one
// exists (S = Sleeper, B = AC 3-tier, A = AC 2-tier, H = AC First/"1A",
// C = AC Chair Car, E = Executive Chair, M = AC 3-tier Economy,
// D = general/Second Sitting). EA (Anubhuti) doesn't have one settled
// letter across rakes yet, so it gets its own clearly-distinct "EA" prefix.
const CLASS_COACH_CONFIG = {
    // Anubhuti Class — the premium executive chair coach introduced on
    // Vande Bharat-type rakes. Same 2+2 recliner layout as EC, but a larger
    // seat pitch means fewer seats fit per coach.
    EA: {
        prefix: "EA",
        coachType: "ANUBHUTI_EXECUTIVE_CHAIR",
        layoutType: "CHAIR_2_2",
        seatsPerCoach: 52,
        seatsPerRow: 4
    },
    EC: {
        prefix: "E",
        coachType: "EXECUTIVE_CHAIR",
        layoutType: "CHAIR_2_2",
        seatsPerCoach: 56,
        seatsPerRow: 4
    },
    "1A": {
        prefix: "H",
        coachType: "FIRST_AC",
        layoutType: "CABIN",
        seatsPerCoach: 18,
        seatsPerBay: 4
    },
    "2A": {
        prefix: "A",
        coachType: "AC_2_TIER",
        layoutType: "BERTH_2_TIER",
        seatsPerCoach: 46,
        seatsPerBay: 6
    },
    "3A": {
        prefix: "B",
        coachType: "AC_3_TIER",
        layoutType: "BERTH_3_TIER",
        seatsPerCoach: 64,
        seatsPerBay: 8
    },
    // AC 3-tier Economy — same main bay as 3A, but the side bay has a third
    // (middle) berth, so each bay seats 9 instead of 8.
    "3E": {
        prefix: "M",
        coachType: "AC_3_TIER_ECONOMY",
        layoutType: "BERTH_3_TIER_ECONOMY",
        seatsPerCoach: 83,
        seatsPerBay: 9
    },
    CC: {
        prefix: "C",
        coachType: "CHAIR_CAR",
        layoutType: "CHAIR_3_2",
        seatsPerCoach: 78,
        seatsPerRow: 5
    },
    SL: {
        prefix: "S",
        coachType: "SLEEPER",
        layoutType: "BERTH_3_TIER",
        seatsPerCoach: 72,
        seatsPerBay: 8
    },
    // Second Sitting — non-AC, unreserved-style bench seating, 3+3 across
    // with no berths at all.
    "2S": {
        prefix: "D",
        coachType: "SECOND_SITTING",
        layoutType: "CHAIR_3_3",
        seatsPerCoach: 108,
        seatsPerRow: 6
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
    // AC 3-tier Economy: same 6-berth main bay as BERTH_3_TIER, but the
    // side bay gets a third berth (Side Middle) instead of just two.
    BERTH_3_TIER_ECONOMY: [
        ["Lower", "LB", "LEFT"],
        ["Middle", "MB", "LEFT"],
        ["Upper", "UB", "LEFT"],
        ["Lower", "LB", "RIGHT"],
        ["Middle", "MB", "RIGHT"],
        ["Upper", "UB", "RIGHT"],
        ["Side Lower", "SL", "SIDE"],
        ["Side Middle", "SM", "SIDE"],
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
    ],
    // Second Sitting: symmetric 3+3 bench seating, no AC-chair pitch to
    // spare, so it's just Window/Middle/Aisle on both sides.
    CHAIR_3_3: [
        ["Window", "W", "LEFT"],
        ["Middle", "M", "LEFT"],
        ["Aisle", "A", "LEFT"],
        ["Aisle", "A", "RIGHT"],
        ["Middle", "M", "RIGHT"],
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
    seatNumber
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
            side
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
        side
    };
};

module.exports = {
    CLASS_COACH_CONFIG,
    buildSeat,
    getCoachConfig,
    isCoachAllowedForClass
};