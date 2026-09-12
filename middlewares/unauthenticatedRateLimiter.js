import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";

const unauthenticatedRateLimiter = async (req, res, next) => {
    try {
        const key = `rate-limit:ip:${req.ip}`;

        const requestCount = await redisClient.incr(key);

        if (requestCount === 1) {
            await redisClient.expire(key, env.UNAUTH_RATE_WINDOW_SECONDS);
        }

        if (requestCount > env.UNAUTH_RATE_LIMIT) {
            let remainingTime = await redisClient.ttl(key);
            if (remainingTime < 0) {
                await redisClient.expire(key, env.UNAUTH_RATE_WINDOW_SECONDS);
                remainingTime = env.UNAUTH_RATE_WINDOW_SECONDS;
            }
            res.setHeader("Retry-After", String(Math.max(1, remainingTime)));

            return res.status(429).json({
                message: `Too many requests. Try again after ${remainingTime} seconds.`
            });
        }

        return next();
    } catch (error) {
        console.log("Unauthenticated rate limiter error:", error);

        // Availability is preferred for public health and validation endpoints.
        return next();
    }
};

export default unauthenticatedRateLimiter;