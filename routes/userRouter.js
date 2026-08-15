import express from 'express';
import{login, logout, profile, signup, deleteAccount} from "../controllers/userController.js"
import { from } from 'node:stream/iter';
import authUserMiddleware from './middlewares/authUserMiddleware.js';

const userRouter = express.Router();

// login , logout , signup , profile
userRouter.post("/login", login);
userRouter.post("/logout", logout);
userRouter.post("/signup", signup);
userRouter.get("/profile",authUserMiddleware,profile);
userRouter.profile("/delete",authUserMiddleware,deleteAccount);

export default userRouter;