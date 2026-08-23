import express from 'express';
import dotenv from 'dotenv/config';
import connectDB from './config/database.js';
import userRouter from './routes/userRouter.js';
import messageRouter from "./routes/messageRouter.js"
import cookieParser from 'cookie-parser';
import chatRouter from './routes/chatRouter.js';


const app = express();


app.use(express.json());
app.use(cookieParser());
app.use("/user", userRouter);
app.use("/chat",chatRouter);
app.use("/msg", messageRouter);

// https://strikes.in/chat/getRecentChat
// https://strikes.in/user/login
// https://strikes.in/user/logout
// https://strikes.in/user/signup
// https://strikes.in/user/profile

const startServer = async ()=>{

    try{
        await connectDB();

        app.listen(process.env.PORT,()=>{
        console.log(`Server has Started Listening at port ${process.env.PORT}`)
        })
    }
    catch(err){
        console.log(err);
    }
}

startServer();