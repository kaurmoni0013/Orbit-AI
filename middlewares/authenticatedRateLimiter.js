import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";

const authenticatedRateLimiter = async (req, res, next) => {
    try {
        const userId = req.userId;

        const key = `rate-limit:user:${userId}`;

        const requestCount = await redisClient.incr(key);

        if (requestCount === 1) {
            await redisClient.expire(key, env.AUTH_RATE_WINDOW_SECONDS);
        }

        if (requestCount > env.AUTH_RATE_LIMIT) {
            let remainingTime = await redisClient.ttl(key);
            if (remainingTime < 0) {
                await redisClient.expire(key, env.AUTH_RATE_WINDOW_SECONDS);
                remainingTime = env.AUTH_RATE_WINDOW_SECONDS;
            }
            res.setHeader("Retry-After", String(Math.max(1, remainingTime)));

            return res.status(429).json({
                message: `Too many requests. Try again after ${remainingTime} seconds.`
            });
        }

        return next();
    } catch (error) {
        console.log("Authenticated rate limiter error:", error);
        return res.status(503).json({ message: "Request protection is temporarily unavailable" });
    }
};

export default authenticatedRateLimiter;