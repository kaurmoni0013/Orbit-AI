import { consumeRateLimit } from "../utils/redisOperations.js";
import { env } from "../config/env.js";

const authenticatedRateLimiter = async (req, res, next) => {
    try {
        const { count, ttl } = await consumeRateLimit(`rate-limit:user:${req.userId}`, env.AUTH_RATE_WINDOW_SECONDS);
        if (count > env.AUTH_RATE_LIMIT) {
            const remainingTime = Math.max(1, ttl);
            res.setHeader("Retry-After", String(remainingTime));
            return res.status(429).json({ message: `Too many requests. Try again after ${remainingTime} seconds.` });
        }
        return next();
    } catch (error) {
        if (env.RATE_LIMIT_FAIL_OPEN) return next();
        console.error(JSON.stringify({ event: "rate_limit.authenticated.failed", requestId: req.requestId, error: error?.name || "UnknownError" }));
        return res.status(503).json({ message: "Request protection is temporarily unavailable" });
    }
};

export default authenticatedRateLimiter;
