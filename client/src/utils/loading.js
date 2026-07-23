export const MIN_LOADING_MS = 2200;

export const wait = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export const withMinimumDuration = async (
    promise,
    minimumMilliseconds = MIN_LOADING_MS
) => {
    const [result] = await Promise.all([
        promise,
        wait(minimumMilliseconds)
    ]);

    return result;
};
