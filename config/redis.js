import { createClient } from "redis";
import { env } from "./env.js";

const redisClient = createClient({
    url: env.REDIS_URL,
    socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(100 * (retries + 1), 3000),
    },
    disableOfflineQueue: true,
});

redisClient.on("error", (error) => {
    console.error(JSON.stringify({ event: "redis.error", error: error?.name || "UnknownError" }));
});

const connectRedis = async () => {
    if (!redisClient.isOpen) await redisClient.connect();
    console.log("Redis connected successfully");
};

export { redisClient, connectRedis };
