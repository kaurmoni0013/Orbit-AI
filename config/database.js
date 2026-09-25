import mongoose from "mongoose";
import { env } from "./env.js";

const connectDB = async () => {
    await mongoose.connect(env.MONGO_URL, {
        serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        connectTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        maxPoolSize: 20,
    });
    console.log("Connected to Database Successfully");
};

export default connectDB;
