import { consumeRateLimit } from "../utils/redisOperations.js";
import { env } from "../config/env.js";

const unauthenticatedRateLimiter = async (req, res, next) => {
    try {
        const { count, ttl } = await consumeRateLimit(`rate-limit:ip:${req.ip}`, env.UNAUTH_RATE_WINDOW_SECONDS);
        if (count > env.UNAUTH_RATE_LIMIT) {
            const remainingTime = Math.max(1, ttl);
            res.setHeader("Retry-After", String(remainingTime));
            return res.status(429).json({ message: `Too many requests. Try again after ${remainingTime} seconds.` });
        }
        return next();
    } catch (error) {
        if (env.RATE_LIMIT_FAIL_OPEN) return next();
        console.error(JSON.stringify({ event: "rate_limit.unauthenticated.failed", requestId: req.requestId, error: error?.name || "UnknownError" }));
        return res.status(503).json({ message: "Request protection is temporarily unavailable" });
    }
};

export default unauthenticatedRateLimiter;
