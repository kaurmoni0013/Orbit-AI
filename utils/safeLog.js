export const logError = (event, context = {}, error) => {
    console.error(JSON.stringify({
        event,
        ...context,
        error: error?.name || "UnknownError",
    }));
};
