const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INDIA_TIME_OFFSET_MINUTES = 330;

const getJourneyDateRange = (value) => {
    const match = DATE_ONLY_PATTERN.exec((value || "").trim());

    if (!match) {
        return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const utcDate = new Date(Date.UTC(year, month - 1, day));

    if (
        utcDate.getUTCFullYear() !== year ||
        utcDate.getUTCMonth() !== month - 1 ||
        utcDate.getUTCDate() !== day
    ) {
        return null;
    }

    // Journey dates are Indian calendar dates. This also includes inventory
    // stored at UTC midnight after a normal YYYY-MM-DD Mongoose cast.
    const start = new Date(
        Date.UTC(year, month - 1, day) -
        INDIA_TIME_OFFSET_MINUTES * 60 * 1000
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    return { start, end };
};

const buildJourneyDateFilter = (value) => {
    const range = getJourneyDateRange(value);

    if (!range) {
        return null;
    }

    return {
        $gte: range.start,
        $lt: range.end
    };
};

module.exports = {
    buildJourneyDateFilter,
    getJourneyDateRange
};
