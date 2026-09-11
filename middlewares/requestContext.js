import crypto from "node:crypto";

const requestContext = (req, res, next) => {
    const requestId = req.get("x-request-id") || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const startedAt = performance.now();

    res.on("finish", () => {
        console.log(JSON.stringify({
            event: "http.request",
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
        }));
    });

    next();
};

export default requestContext;
