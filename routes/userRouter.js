import express from 'express';
import{login, logout, profile, signup} from "../controllers/userController.js"
import { from } from 'node:stream/iter';

const userRouter = express.Router();

// login , logout , signup , profile
userRouter.post("/login", login);
userRouter.post("/logout", logout);
userRouter.post("/signup", signup);
userRouter.get("/profile", profile);

export default userRouter;