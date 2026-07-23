export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const STATION_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
export const DURATION_PATTERN = /^(\d+)h\s?(\d{1,2})m$/;

export const CLASS_OPTIONS = [
    { code: "SL", name: "Sleeper" },
    { code: "CC", name: "AC Chair Car" },
    { code: "EC", name: "Executive Chair Car" },
    { code: "3A", name: "AC 3 Tier" },
    { code: "2A", name: "AC 2 Tier" },
    { code: "1A", name: "First AC" },
    { code: "2S", name: "Second Sitting" }
];

export const TRAIN_TYPES = [
    "Express",
    "Superfast",
    "Rajdhani",
    "Shatabdi",
    "Duronto",
    "Passenger",
    "Intercity",
    "Vande Bharat"
];

export const FACILITIES = [
    { key: "pantry", label: "Pantry" },
    { key: "wifi", label: "WiFi" },
    { key: "chargingPoint", label: "Charging" },
    { key: "blanket", label: "Blanket" },
    { key: "cctv", label: "CCTV" }
];

export const initialTrainForm = {
    trainNumber: "",
    name: "",
    trainType: "Express",
    status: "ACTIVE",
    rating: "4.2",
    sourceCode: "",
    sourceName: "",
    destinationCode: "",
    destinationName: "",
    departureTime: "",
    arrivalTime: "",
    duration: "",
    distance: "",
    destinationDay: "1",
    runningDays: [],
    classes: [
        {
            code: "SL",
            name: "Sleeper",
            farePerKm: "",
            totalSeats: ""
        }
    ],
    stops: [],
    facilities: {
        pantry: false,
        wifi: false,
        chargingPoint: true,
        blanket: false,
        cctv: false
    }
};

export function titleForClass(code) {
    return CLASS_OPTIONS.find((option) => option.code === code)?.name || "";
}

export function normalizeCode(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

export function parsePositiveNumber(value) {
    if (value === "" || value === null || value === undefined) return NaN;
    return Number(value);
}

export function durationToHours(duration) {
    const match = String(duration || "").trim().match(DURATION_PATTERN);
    if (!match) return 0;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (minutes >= 60) return 0;

    return hours + minutes / 60;
}

export function errorFor(errors, key) {
    return errors[key] ? errors[key] : null;
}

/**
 * Converts a train document (as stored in Mongo / returned by the API)
 * into the flat, controlled-input friendly shape used by the form.
 */
export function buildFormFromTrain(train) {
    if (!train) return { ...initialTrainForm };

    const route = Array.isArray(train.route) ? train.route : [];
    const firstStop = route[0];
    const lastStop = route[route.length - 1];
    const middleStops = route.slice(1, Math.max(route.length - 1, 1));

    return {
        trainNumber: train.trainNumber || "",
        name: train.name || "",
        trainType: train.trainType || "Express",
        status: train.status || "ACTIVE",
        rating: train.rating !== undefined && train.rating !== null ? String(train.rating) : "0",
        sourceCode: train.source?.stationCode || firstStop?.stationCode || "",
        sourceName: train.source?.stationName || firstStop?.stationName || "",
        destinationCode: train.destination?.stationCode || lastStop?.stationCode || "",
        destinationName: train.destination?.stationName || lastStop?.stationName || "",
        departureTime: train.departureTime || firstStop?.departureTime || "",
        arrivalTime: train.arrivalTime || lastStop?.arrivalTime || "",
        duration: train.duration || "",
        distance: train.distance !== undefined && train.distance !== null ? String(train.distance) : "",
        destinationDay: lastStop?.day ? String(lastStop.day) : "1",
        runningDays: Array.isArray(train.runningDays) ? [...train.runningDays] : [],
        classes: Array.isArray(train.classes) && train.classes.length
            ? train.classes.map((item) => ({
                code: item.code || "",
                name: item.name || titleForClass(item.code),
                farePerKm: item.farePerKm !== undefined && item.farePerKm !== null ? String(item.farePerKm) : "",
                totalSeats: item.totalSeats !== undefined && item.totalSeats !== null ? String(item.totalSeats) : ""
            }))
            : [{ code: "SL", name: "Sleeper", farePerKm: "", totalSeats: "" }],
        stops: middleStops.map((stop) => ({
            stationCode: stop.stationCode || "",
            stationName: stop.stationName || "",
            arrivalTime: stop.arrivalTime || "",
            departureTime: stop.departureTime || "",
            distance: stop.distance !== undefined && stop.distance !== null ? String(stop.distance) : "",
            day: stop.day ? String(stop.day) : "1"
        })),
        facilities: {
            pantry: Boolean(train.facilities?.pantry),
            wifi: Boolean(train.facilities?.wifi),
            chargingPoint: Boolean(train.facilities?.chargingPoint),
            blanket: Boolean(train.facilities?.blanket),
            cctv: Boolean(train.facilities?.cctv)
        }
    };
}

export function validateTrainForm(form) {
    const errors = {};
    const distance = parsePositiveNumber(form.distance);
    const destinationDay = Number.parseInt(form.destinationDay, 10);

    if (!/^\d{5}$/.test(form.trainNumber.trim())) {
        errors.trainNumber = "Enter a 5 digit train number.";
    }

    if (form.name.trim().length < 3) {
        errors.name = "Train name is required.";
    }

    if (!form.trainType.trim()) {
        errors.trainType = "Train type is required.";
    }

    if (!STATION_CODE_PATTERN.test(form.sourceCode)) {
        errors.sourceCode = "Enter a valid source code.";
    }

    if (!form.sourceName.trim()) {
        errors.sourceName = "Source station name is required.";
    }

    if (!STATION_CODE_PATTERN.test(form.destinationCode)) {
        errors.destinationCode = "Enter a valid destination code.";
    }

    if (!form.destinationName.trim()) {
        errors.destinationName = "Destination station name is required.";
    }

    if (form.sourceCode && form.sourceCode === form.destinationCode) {
        errors.destinationCode = "Destination must be different.";
    }

    if (!TIME_PATTERN.test(form.departureTime)) {
        errors.departureTime = "Enter a valid time.";
    }

    if (!TIME_PATTERN.test(form.arrivalTime)) {
        errors.arrivalTime = "Enter a valid time.";
    }

    const durationHours = durationToHours(form.duration);
    if (durationHours <= 0) {
        errors.duration = "Use a duration like 5h 30m.";
    }

    if (!Number.isFinite(distance) || distance <= 0) {
        errors.distance = "Distance must be greater than 0.";
    }

    if (!Number.isInteger(destinationDay) || destinationDay < 1 || destinationDay > 7) {
        errors.destinationDay = "Day must be 1 to 7.";
    }

    if (!form.runningDays.length) {
        errors.runningDays = "Select at least one running day.";
    }

    if (!form.classes.length) {
        errors.classes = "Add at least one class.";
    }

    const selectedClassCodes = [];
    form.classes.forEach((item, index) => {
        if (!item.code) {
            errors[`class-${index}-code`] = "Select a class.";
        } else if (selectedClassCodes.includes(item.code)) {
            errors[`class-${index}-code`] = "Class already added.";
        }
        selectedClassCodes.push(item.code);

        const farePerKm = parsePositiveNumber(item.farePerKm);
        const totalSeats = parsePositiveNumber(item.totalSeats);

        if (!Number.isFinite(farePerKm) || farePerKm <= 0) {
            errors[`class-${index}-farePerKm`] = "Enter fare per km.";
        }

        if (!Number.isInteger(totalSeats) || totalSeats <= 0) {
            errors[`class-${index}-totalSeats`] = "Enter seats.";
        }
    });

    let previousDistance = 0;
    let previousDay = 1;

    form.stops.forEach((stop, index) => {
        const stopDistance = parsePositiveNumber(stop.distance);
        const stopDay = Number.parseInt(stop.day, 10);

        if (!STATION_CODE_PATTERN.test(stop.stationCode)) {
            errors[`stop-${index}-stationCode`] = "Enter a valid code.";
        }

        if (!stop.stationName.trim()) {
            errors[`stop-${index}-stationName`] = "Station name is required.";
        }

        if (!TIME_PATTERN.test(stop.arrivalTime)) {
            errors[`stop-${index}-arrivalTime`] = "Enter arrival time.";
        }

        if (!TIME_PATTERN.test(stop.departureTime)) {
            errors[`stop-${index}-departureTime`] = "Enter departure time.";
        }

        if (!Number.isFinite(stopDistance) || stopDistance <= previousDistance) {
            errors[`stop-${index}-distance`] = "Distance must increase.";
        } else if (Number.isFinite(distance) && stopDistance >= distance) {
            errors[`stop-${index}-distance`] = "Must be before destination.";
        }

        if (!Number.isInteger(stopDay) || stopDay < 1 || stopDay > 7) {
            errors[`stop-${index}-day`] = "Day must be 1 to 7.";
        } else if (stopDay < previousDay) {
            errors[`stop-${index}-day`] = "Day cannot go backward.";
        }

        if (Number.isFinite(stopDistance)) previousDistance = stopDistance;
        if (Number.isInteger(stopDay)) previousDay = stopDay;
    });

    if (Number.isInteger(destinationDay) && destinationDay < previousDay) {
        errors.destinationDay = "Day cannot go backward.";
    }

    const rating = parsePositiveNumber(form.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        errors.rating = "Rating must be 0 to 5.";
    }

    return errors;
}

export function computeAverageSpeed(form) {
    const distance = parsePositiveNumber(form.distance);
    const hours = durationToHours(form.duration);

    if (!Number.isFinite(distance) || distance <= 0 || hours <= 0) return 0;

    return Math.round(distance / hours);
}

export function buildTrainPayload(form) {
    const distance = Number(form.distance);
    const averageSpeed = computeAverageSpeed(form);

    const route = [
        {
            stationCode: form.sourceCode,
            stationName: form.sourceName.trim(),
            arrivalTime: "",
            departureTime: form.departureTime,
            distance: 0,
            day: 1
        },
        ...form.stops.map((stop) => ({
            stationCode: stop.stationCode,
            stationName: stop.stationName.trim(),
            arrivalTime: stop.arrivalTime,
            departureTime: stop.departureTime,
            distance: Number(stop.distance),
            day: Number(stop.day)
        })),
        {
            stationCode: form.destinationCode,
            stationName: form.destinationName.trim(),
            arrivalTime: form.arrivalTime,
            departureTime: "",
            distance,
            day: Number(form.destinationDay)
        }
    ];

    return {
        trainNumber: form.trainNumber.trim(),
        name: form.name.trim(),
        trainType: form.trainType.trim(),
        status: form.status,
        source: {
            stationCode: form.sourceCode,
            stationName: form.sourceName.trim()
        },
        destination: {
            stationCode: form.destinationCode,
            stationName: form.destinationName.trim()
        },
        route,
        departureTime: form.departureTime,
        arrivalTime: form.arrivalTime,
        duration: form.duration.trim().replace(/\s+/, " "),
        distance,
        averageSpeed,
        runningDays: form.runningDays,
        classes: form.classes.map((item) => ({
            code: item.code,
            name: item.name || titleForClass(item.code),
            farePerKm: Number(item.farePerKm),
            totalSeats: Number(item.totalSeats)
        })),
        facilities: form.facilities,
        rating: Number(form.rating)
    };
}