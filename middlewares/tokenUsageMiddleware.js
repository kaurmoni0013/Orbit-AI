import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";

const tokenUsageMiddleware = async (req, res, next) => {
    try {
        const key = `token-usage:${req.userId}`;

        const tokenUsed = await redisClient.get(key);
        const tokenLimit = env.TOKEN_LIMIT;
        const tokenWindowSeconds = env.TOKEN_WINDOW_SECONDS;

        if (Number(tokenUsed || 0) >= tokenLimit) {
            let remainingTime = await redisClient.ttl(key);

            // Repair keys created without an expiry after a previous Redis error.
            if (remainingTime === -1) {
                await redisClient.expire(key, tokenWindowSeconds);
                remainingTime = tokenWindowSeconds;
            }

            return res.status(429).json({
                message: "Token limit reached. Please try after some time.",
                tokenUsed: Number(tokenUsed),
                tokenLimit,
                retryAfter: remainingTime
            });
        }

        req.tokenUsageKey = key;

        next();
    } catch (error) {
        console.log("Token usage middleware error:", error);
        next();
    }
};

export default tokenUsageMiddleware;