import mongoose from "mongoose";
import Chat from "../model/chatSchema.js";
import Message from "../model/messageSchema.js";
import User from "../model/userSchema.js";
import { generateAIResponse } from "./openRouterService.js";
import { redisClient } from "../config/redis.js";
import { env } from "../config/env.js";
import { addUserTokenUsage } from "../utils/userUsage.js";
import {
  acquireLock,
  adjustTokenUsage,
  releaseLock,
  renewLock,
  reserveTokenUsage,
} from "../utils/redisOperations.js";
import { logError } from "../utils/safeLog.js";

const SUMMARY_CHUNK_SIZE = 20;

export const updateSummaryIfNeeded = async (chatId) => {
  const lockTtlSeconds = env.SUMMARY_LOCK_TTL_SECONDS;
  const lock = await acquireLock(`summary-lock:${chatId}`, lockTtlSeconds);
  if (!lock) return;

  const renewalInterval = setInterval(() => {
    void renewLock(lock, lockTtlSeconds).catch((error) => {
      logError("summary.lock_renewal_failed", {}, error);
    });
  }, Math.max(1, Math.floor(lockTtlSeconds / 2)) * 1000);

  try {
    const chat = await Chat.findById(chatId);

    if (!chat) return;

    const unsummarizedCount =
      chat.messageCount - chat.summarizedTillMessageNumber;

    if (unsummarizedCount < SUMMARY_CHUNK_SIZE) return;

    const messagesToSummarize = await Message.find({
      chatId: chat._id,
    })
      .sort({ createdAt: 1 })
      .skip(chat.summarizedTillMessageNumber)
      .limit(SUMMARY_CHUNK_SIZE);

    if (messagesToSummarize.length === 0) return;

    const summaryMessages = [
      {
        role: "system",
        content: "Summarize the conversation. Keep important context, user goals, decisions, and unresolved doubts. Do not add extra information."
      },

      {
        role: "user",
        content: `Previous summary: ${chat.summary || "No previous summary yet."}`
      },

      ...messagesToSummarize.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),

      {
        role: "user",
        content: "Summarize the above conversation."
      }
    ];

    const tokenUsageKey = `token-usage:${chat.userId}`;
    const estimatedTokens = Math.min(
      env.TOKEN_LIMIT,
      Math.max(
        512,
        Math.ceil(
          summaryMessages.reduce(
            (total, message) => total + message.content.length,
            0,
          ) / 4,
        ) + env.AI_MAX_OUTPUT_TOKENS,
      ),
    );
    const reservation = await reserveTokenUsage(tokenUsageKey, estimatedTokens);
    if (!reservation.allowed) return;

    let aiReply;
    let usage;
    try {
      ({ aiReply, usage } = await generateAIResponse({
        model: chat.model,
        messages: summaryMessages,
      }));
    } catch (error) {
      await adjustTokenUsage(tokenUsageKey, -estimatedTokens);
      throw error;
    }
    await adjustTokenUsage(tokenUsageKey, usage.totalTokens - estimatedTokens);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await Chat.updateOne(
          { _id: chat._id, summarizedTillMessageNumber: chat.summarizedTillMessageNumber },
          {
            $set: {
              summary: aiReply.slice(0, env.AI_SUMMARY_CHAR_LIMIT),
              summaryUpdatedAt: new Date(),
            },
            $inc: {
              summarizedTillMessageNumber: messagesToSummarize.length,
              "usage.promptTokens": usage.promptTokens,
              "usage.completionTokens": usage.completionTokens,
              "usage.totalTokens": usage.totalTokens,
            },
          },
          { session },
        );
        if (updated.matchedCount !== 1) throw new Error("Summary range was claimed by another job");

        const user = await User.findById(chat.userId).session(session);
        if (user) await addUserTokenUsage(user, usage.totalTokens, session);
      });
    } finally {
      await session.endSession();
    }

    return Number(await redisClient.get(tokenUsageKey));
  } finally {
    clearInterval(renewalInterval);
    await releaseLock(lock);
  }
};