import jwt from "jsonwebtoken";
import { redisClient } from "../config/redis.js";
import User from "../model/userSchema.js";
import { env } from "../config/env.js";
import { getTokenBlocklistKey, jwtVerifyOptions } from "../utils/token.js";

const authCookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
};

const authUserMiddleware = async (req, res, next) => {
    try {
        const { token } = req.cookies;
        if (!token) return res.status(401).json({ message: "You need to login first" });

        const payload = jwt.verify(token, env.JWT_SECRET, jwtVerifyOptions);
        const blockedToken = await redisClient.get(getTokenBlocklistKey(token));
        if (blockedToken) {
            res.clearCookie("token", authCookieOptions);
            return res.status(401).json({ message: "Please login again" });
        }

        const user = await User.findById(payload.id);
        if (!user || Number(payload.sv || 0) !== Number(user.sessionVersion || 0)) {
            res.clearCookie("token", authCookieOptions);
            return res.status(401).json({ message: "Please login again" });
        }

        req.userId = payload.id;
        req.token = token;
        req.tokenPayload = payload;
        req.user = user;
        res.set("Cache-Control", "no-store");
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            res.clearCookie("token", authCookieOptions);
            return res.status(401).json({ message: "Please login again" });
        }
        console.error(JSON.stringify({ event: "auth.session.failed", requestId: req.requestId, error: error?.name || "UnknownError" }));
        return res.status(503).json({ message: "Session protection is temporarily unavailable" });
    }
};

export default authUserMiddleware;
