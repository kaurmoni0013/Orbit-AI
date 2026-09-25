import express from "express";
import { login, logout, profile, signup, deleteAccount, forgotPassword, resetPassword } from "../config/controllers/userController.js";
import authUserMiddleware from "../middlewares/authUserMiddleware.js";
import unauthenticatedRateLimiter from "../middlewares/unauthenticatedRateLimiter.js";
import authenticatedRateLimiter from "../middlewares/authenticatedRateLimiter.js";

const userRouter = express.Router();

userRouter.post("/login", unauthenticatedRateLimiter, login);
userRouter.post("/signup", unauthenticatedRateLimiter, signup);
userRouter.post("/forgot-password", unauthenticatedRateLimiter, forgotPassword);
userRouter.post("/reset-password", unauthenticatedRateLimiter, resetPassword);
userRouter.post("/logout", authUserMiddleware, authenticatedRateLimiter, logout);
userRouter.get("/profile", authUserMiddleware, authenticatedRateLimiter, profile);
userRouter.delete("/delete", authUserMiddleware, authenticatedRateLimiter, deleteAccount);

export default userRouter;
