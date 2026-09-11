import { env } from "./config/env.js";
import { connectRedis, redisClient } from "./config/redis.js";
import connectDB from "./config/database.js";
import mongoose from "mongoose";
import app from "./app.js";

const startServer = async () => {
    try {
        await connectDB();
        await connectRedis();

        const server = app.listen(env.PORT, () => {
            console.log(`Server has Started Listening at port ${env.PORT}`);
        });

        const shutdown = async (signal) => {
            console.log(`${signal} received, shutting down`);
            server.close(async () => {
                await redisClient.quit();
                await mongoose.disconnect();
                process.exit(0);
            });
        };

        process.once("SIGTERM", () => shutdown("SIGTERM"));
        process.once("SIGINT", () => shutdown("SIGINT"));
    } catch (error) {
        console.error("Server startup failed:", error);
        process.exitCode = 1;
    }
};

startServer();

export { startServer };
