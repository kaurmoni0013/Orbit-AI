import express from 'express';
import connectDB from './config/database.js';
import dotenv from 'dotenv';
import userRouter from './routes/userRouter.js';


dotenv.config();
const app = express();
app.use(express.json);

app.use("/user", userRouter);


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