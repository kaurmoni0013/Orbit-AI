import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";
import { reserveTokenUsage, adjustTokenUsage } from "../utils/redisOperations.js";

const tokenUsageMiddleware = async (req, res, next) => {
    try {
        const key = `token-usage:${req.userId}`;

        const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
        const estimatedTokens = Math.min(
            env.TOKEN_LIMIT,
            Math.max(
                512,
                Math.ceil(content.length / 4) + env.AI_MAX_OUTPUT_TOKENS
            )
        );
        const reservation = await reserveTokenUsage(key, estimatedTokens);
        if (!reservation.allowed) {
            const remainingTime = reservation.ttl < 0 ? env.TOKEN_WINDOW_SECONDS : reservation.ttl;
            res.setHeader("Retry-After", String(Math.max(1, remainingTime)));
            return res.status(429).json({
                message: "Token limit reached. Please try after some time.",
                tokenUsed: reservation.tokenUsed,
                tokenLimit: env.TOKEN_LIMIT,
                retryAfter: remainingTime
            });
        }

        req.tokenUsageKey = key;
        req.tokenReservation = estimatedTokens;
        req.tokenReservationSettled = false;
        req.reconcileTokenReservation = async (actualTokens) => {
            await adjustTokenUsage(key, actualTokens - estimatedTokens);
            req.tokenReservationSettled = true;
        };
        res.once("finish", () => {
            if (!req.tokenReservationSettled && res.statusCode >= 400) {
                void req.reconcileTokenReservation(0).catch((releaseError) => {
                    console.log("Failed to release token reservation:", releaseError);
                });
            }
        });

        return next();
    } catch (error) {
        console.log("Token usage middleware error:", error);
        return res.status(503).json({ message: "Token quota is temporarily unavailable" });
    }
};

export default tokenUsageMiddleware;