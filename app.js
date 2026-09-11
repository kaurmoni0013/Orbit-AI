import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { redisClient } from "./config/redis.js";
import userRouter from "./routes/userRouter.js";
import messageRouter from "./routes/messageRouter.js";
import chatRouter from "./routes/chatRouter.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";
import requestContext from "./middlewares/requestContext.js";

const app = express();

const allowedOrigins = env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : 0);
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestContext);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "chatgpt-backend" });
});

app.get("/ready", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    const redisReady = redisClient.isReady;
    const ready = databaseReady && redisReady;

    res.status(ready ? 200 : 503).json({
        status: ready ? "ready" : "not_ready",
        dependencies: {
            database: databaseReady ? "up" : "down",
            redis: redisReady ? "up" : "down",
        },
    });
});

app.use("/user", userRouter);
app.use("/chat", chatRouter);
app.use("/msg", messageRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
