import { createClient } from "redis";
import { env } from "./env.js";

const redisClient = createClient({
    url: env.REDIS_URL
});

redisClient.on("error", (error) => {
    console.log("Redis error:", error);
});

const connectRedis = async () => {
    await redisClient.connect();
    console.log("Redis connected successfully");
};

export { redisClient, connectRedis };