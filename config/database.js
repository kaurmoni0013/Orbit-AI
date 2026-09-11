import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async ()=>{

        await mongoose.connect(env.MONGO_URL);
        console.log("Connected to Database Successfully");

}

export default connectDB;