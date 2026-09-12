import jwt from "jsonwebtoken";
import { redisClient } from "../config/redis.js";
import User from "../model/userSchema.js";
import { env } from "../config/env.js";

const authCookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
};

const authUserMiddleware = async (req, res, next) => {
    try {
        const { token } = req.cookies;

        if (!token) {
            return res.status(401).json({
                message: "You need to login first"
            });
        }

        const blockedToken = await redisClient.get(
            `blocklist:${token}`
        );

        if (blockedToken) {
            return res.status(401).json({
                message: "Please login again"
            });
        }

        const payload = jwt.verify(
            token,
            env.JWT_SECRET
        );

        const user = await User.findOne({ _id: payload.id });

        if (!user) {
            return res.status(401).json({
                message: "User not found"
            });
        } 

        req.userId = payload.id;
        req.token = token;
        req.tokenPayload = payload;
        req.user = user;

        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            res.clearCookie("token", authCookieOptions);
            return res.status(401).json({
                message: "Please login again"
            });
        }

        console.log("Authentication error:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

export default authUserMiddleware;