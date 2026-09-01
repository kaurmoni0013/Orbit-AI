import express from 'express'
import authUserMiddleware from '../middlewares/authUserMiddleware.js';
import { getSingleChat,getRecentChat,createChat,deleteChat } from '../controllers/chatController.js';
import authenticatedRateLimiter from '../middlewares/authenticatedRateLimiter.js';
const chatRouter = express.Router();
 
chatRouter.use(authUserMiddleware);
chatRouter.use(authenticatedRateLimiter);

// get recent chats:top 20,get single chat, create chat , delete chat


chatRouter.post("/createChat",createChat);
chatRouter.get("/getRecentChat",getRecentChat);
chatRouter.get("/:chatId",getSingleChat);
chatRouter.delete("/:chatId",deleteChat);


export  default chatRouter;