import crypto from "node:crypto";

const requestContext = (req, res, next) => {
    const suppliedRequestId = req.get("x-request-id");
    const requestId = suppliedRequestId && /^[a-zA-Z0-9._:-]{1,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const startedAt = performance.now();

    res.on("finish", () => {
        console.log(JSON.stringify({
            event: "http.request",
            requestId,
            method: req.method,
            path: `${req.baseUrl}${req.path}`,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
        }));
    });

    next();
};

export default requestContext;
