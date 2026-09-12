import Chat from "../model/chatSchema.js"
import Message from "../model/messageSchema.js";
import mongoose from "mongoose";
import { env } from "../config/env.js";

const allowedModels = new Set(
  env.ALLOWED_MODELS.split(",").map((model) => model.trim()).filter(Boolean)
);

// getRecentChat: , getSingleChat , createChat, deleteChat
//

// req.user = user ki information hogi// last 20 chats muje fetch karni hai

export const getRecentChat = async(req,res)=>{
    try{
       const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
       const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
       const skip = (page - 1) * limit;
       const [chats, total] = await Promise.all([
         Chat.find({ userId: req.user._id, messageCount: { $gt: 0 } }).select("topic pinned updatedAt").sort({ pinned: -1, updatedAt: -1 })
           .skip(skip).limit(limit),
         Chat.countDocuments({ userId: req.user._id, messageCount: { $gt: 0 } }),
       ]);

      res.status(200).json({
        message: "Your all recent chats",
        chats,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      })

    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message: "Internal server error"
        })
    }
}

export const getSingleChat = async(req,res)=>{
    try{
          
        const {chatId} = req.params;

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ message: "Invalid chat id" });
        }

        const chat = await Chat.findOne({_id:chatId, userId: req.user._id});

        if(!chat){
            return res.status(404).json({
                message: "Sorry data not found"
            })
        }

        res.status(200).json({
            chatId: chat._id,
            userId: chat.userId,
            topic: chat.topic,
            pinned: chat.pinned,
            usage: chat.usage
        }) 
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message: "Internal server error"
        })
    }
}


export const createChat = async(req,res)=>{
    try{
         
        const model = typeof req.body.model === "string"
          ? req.body.model.trim()
          : "";
        // opus4.8 , sol4.2 , fkljhewqoi
        if(!model || typeof model !== "string"){
            return res.status(400).json({
                message: "Model name is missing"
            })
        }

        if (!allowedModels.has(model)) {
            return res.status(400).json({
                message: "Unsupported model"
            });
        }
        
        const chats = await Chat.create({
            userId: req.user._id,
            model,
        })


        res.status(201).json({
            chatId: chats._id,
            userId: req.user._id,
            model,
            topic: chats.topic,
            createdAt: chats.createdAt
        })


    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message: "Internal server error"
        })
    }
}

export const deleteChat = async(req,res)=>{
    try{
       
        const {chatId} = req.params;

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
             return res.status(400).json({ message: "Invalid chat id" });
        }

       const chat = await Chat.findOne({_id:chatId, userId: req.user._id});

       if(!chat){
            return res.status(403).json({
                message: "You are not allowed to do this"
            })
       };

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Message.deleteMany({
                    chatId: chat._id
                }, { session });

                await Chat.deleteOne({
                    _id: chatId,
                    userId: req.user._id
                }, { session });
            });
        } finally {
            await session.endSession();
        }

       

        res.status(200).json({
            message: "Your chat deleted successfully"
        })
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            message: "Internal server error"
        })
    }
}

const findOwnedChat = async (chatId, userId) => {
    if (!mongoose.Types.ObjectId.isValid(chatId)) return null;
    return Chat.findOne({ _id: chatId, userId });
};

export const renameChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const topic = typeof req.body.topic === "string" ? req.body.topic.trim() : "";
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ message: "Invalid chat id" });
        }
        if (!topic || topic.length > 120) {
            return res.status(400).json({ message: "Chat name must be between 1 and 120 characters" });
        }
        const chat = await findOwnedChat(chatId, req.user._id);
        if (!chat) return res.status(404).json({ message: "Chat not found" });
        chat.topic = topic;
        await chat.save();
        return res.status(200).json({ chatId: chat._id, topic: chat.topic, pinned: chat.pinned });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const togglePinChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ message: "Invalid chat id" });
        }
        const chat = await findOwnedChat(chatId, req.user._id);
        if (!chat) return res.status(404).json({ message: "Chat not found" });
        chat.pinned = !chat.pinned;
        await chat.save();
        return res.status(200).json({ chatId: chat._id, topic: chat.topic, pinned: chat.pinned });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};