import Chat from "../model/chatSchema.js";
import Message from "../model/messageSchema.js";
import mongoose from "mongoose";
import {generateAIResponse} from "../service/openRouterService.js"
import {buildMessagesForAI} from "../utils/chatContext.js"
import {
  addUserTokenUsage,
} from "../utils/userUsage.js";
import { addChatTokenUsage } from "../utils/tokenUsage.js";
import {updateSummaryIfNeeded} from "../service/summaryService.js"
import {redisClient} from "../config/redis.js"
import { env } from "../config/env.js";

const MAX_MESSAGE_LENGTH = 12000;
const allowedModels = new Set(
  env.ALLOWED_MODELS.split(",").map((model) => model.trim()).filter(Boolean)
);

// getMessage, sendMessage

export const getMessage = async(req,res)=>{
    try{

        const {chatId} = req.params;

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ message: "Invalid chat id" });
        }

        // verfiy that this chatID belongs to this user or not
        
        const chat = await Chat.findOne({
            _id: chatId,
            userId: req.user._id
        });


        if(!chat){
            return res.status(404).json({
                messages: "Chat Not found"
            });
        }


        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;
        const [messages, total] = await Promise.all([
            Message.find({ chatId }).sort({createdAt:1}).skip(skip).limit(limit),
            Message.countDocuments({ chatId }),
        ]);

        res.status(200).json({
            messages: "Your are all messages are here",
            msg: messages,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    }
    catch(err){
        console.log(err);
        res.status(500).json({
            messages: "Internal server error"
        })
    }
}



export const sendMessage = async (req, res) => {
  let createdChat;
  try {
    const { chatId } = req.params;
    const { content } = req.body;
    const model = typeof req.body.model === "string"
      ? req.body.model.trim()
      : "";

    if (typeof content !== "string" || content.trim() === "") {
      return res.status(400).json({
        message: "Message content is required"
      });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`
      });
    }


    

    let chat;

    // 2. Existing chat case
    if (chatId) {
      // Check valid MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({
          message: "Invalid chat id"
        });
      }

      chat = await Chat.findOne({
        _id: chatId,
        userId: req.user._id
      });

      if (!chat) {
        return res.status(404).json({
          message: "Chat not found"
        });
      }
    }

    // 3. New chat case
    else {
      if (!model || typeof model !== "string") {
        return res.status(400).json({
          message: "Model is required for new chat"
        });
      }

      if (!allowedModels.has(model)) {
        return res.status(400).json({
          message: "Unsupported model"
        });
      }

      chat = await Chat.create({
        userId: req.user._id,
        model,
        topic: trimmedContent.slice(0, 40),
      });
      createdChat = chat;
    }

    

    // our code start here
    // oldMessages: Jinki abhi tak summary create nahi hui hai
    const oldMessages = await Message.find({
      chatId: chat._id,
    })
      .sort({ createdAt: 1 })
      .skip(chat.summarizedTillMessageNumber);

    const messagesForAI = buildMessagesForAI({
      chat,
      oldMessages,
      currentMessage: trimmedContent,
    });

    const { aiReply, usage } = await generateAIResponse({
      model: chat.model,
      messages: messagesForAI,
    });

    const userMessage = await Message.create({
      chatId: chat._id,
      role: "user",
      content: trimmedContent,
      userId: req.user._id
    });

    const assistantMessage = await Message.create({
      chatId: chat._id,
      role: "assistant",
      content: aiReply,
       userId: req.user._id,
       usage,
    });

    chat.messageCount += 2;

    if (chat.topic === "New Chat") {
      chat.topic = content.trim().slice(0, 40);
    }

    await addChatTokenUsage(chat, usage);
    await addUserTokenUsage(req.user, usage.totalTokens);

    // redis ke andar information ko daalna padega

    let tokenUsed = req.user.usage.tokenUsed;
    if (req.tokenUsageKey) {
      try {
        tokenUsed = await redisClient.incrBy(
          req.tokenUsageKey,
          usage.totalTokens
        );

        const tokenUsageTtl = await redisClient.ttl(req.tokenUsageKey);
        if (tokenUsageTtl === -1) {
          await redisClient.expire(req.tokenUsageKey, env.TOKEN_WINDOW_SECONDS);
        }
      } catch (error) {
        console.log("Redis token usage update error:", error);
      }
    }

    void updateSummaryIfNeeded(chat._id).catch((error) => {
      console.log("Conversation summary update error:", error);
    });

    return res.status(201).json({
      message: "Message sent successfully",
      chatId: chat._id,
      reply: aiReply,
      usage,
      tokenUsed,
      tokenLimit: env.TOKEN_LIMIT,
      userMessage,
      assistantMessage
    });
  } catch (err) {
    if (createdChat) {
      await Promise.all([
        Message.deleteMany({ chatId: createdChat._id }),
        Chat.deleteOne({ _id: createdChat._id, userId: req.user._id }),
      ]).catch((cleanupError) => {
        console.log("Failed to clean up incomplete chat:", cleanupError);
      });
    }
    console.log(err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};