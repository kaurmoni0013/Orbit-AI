import dns from "dns";
import mongoose from "mongoose";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = async ()=>{

        await mongoose.connect(process.env.MONGO_URL);
        console.log("Connected to Database Successfully");

}

export default connectDB;