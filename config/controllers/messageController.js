import Chat from "../../model/chatSchema.js";
import Message from "../../model/messageSchema.js";
import mongoose from "mongoose";
import {generateAIResponse, streamAIResponse, consumeAIStream} from "../../service/openRouterService.js"
import {buildMessagesForAI} from "../../utils/chatContext.js"
import {
  addUserTokenUsage,
} from "../../utils/userUsage.js";
import { addChatTokenUsage } from "../../utils/tokenUsage.js";
import {updateSummaryIfNeeded} from "../../service/summaryService.js"
import {redisClient} from "../redis.js"
import { env } from "../env.js";
import { allowedModels } from "../allowedModels.js";
import { logError } from "../../utils/safeLog.js";

const MAX_MESSAGE_LENGTH = 12000;

const getIdempotencyKey = (req) => {
  const key = req.get("x-idempotency-key");
  return typeof key === "string" && /^[a-zA-Z0-9._:-]{8,128}$/.test(key) ? key : null;
};

const findCompletedPair = async (userId, key) => {
  if (!key) return null;
  const userMessage = await Message.findOne({ userId, clientRequestId: key });
  if (!userMessage) return null;
  const assistantMessage = await Message.findOne({
    chatId: userMessage.chatId,
    role: "assistant",
    createdAt: { $gte: userMessage.createdAt },
  }).sort({ createdAt: 1 });
  if (!assistantMessage) {
    const error = new Error("A matching request is still being completed");
    error.statusCode = 409;
    throw error;
  }
  return [userMessage, assistantMessage];
};

const releaseDuplicateReservation = async (req) => {
  if (req.reconcileTokenReservation && !req.tokenReservationSettled) await req.reconcileTokenReservation(0);
};

const persistMessagePair = async ({ chat, user, content, aiReply, usage, clientRequestId = null }) => {
  const session = await mongoose.startSession();
  let createdMessages;
  try {
    await session.withTransaction(async () => {
      createdMessages = await Message.create([
        { chatId: chat._id, role: "user", content, userId: user._id, clientRequestId },
        { chatId: chat._id, role: "assistant", content: aiReply, userId: user._id, usage },
      ], { session, ordered: true });
      const nextTopic = chat.topic === "New Chat" ? content.slice(0, 40) : undefined;
      await addChatTokenUsage(chat, usage, session, { messageCountDelta: 2, topic: nextTopic });
      await addUserTokenUsage(user, usage.totalTokens, session);
    });
  } finally {
    await session.endSession();
  }
  return createdMessages;
};

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
        logError("message.request.failed", { requestId: req.requestId }, err);
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

    const clientRequestId = getIdempotencyKey(req);
    const completedPair = await findCompletedPair(req.user._id, clientRequestId);
    if (completedPair) {
      await releaseDuplicateReservation(req);
      const assistantMessage = completedPair[1];
      return res.status(200).json({
        message: "Message already completed",
        chatId: assistantMessage.chatId,
        reply: assistantMessage.content,
        usage: assistantMessage.usage,
        tokenUsed: req.user.usage.tokenUsed,
        tokenLimit: env.TOKEN_LIMIT,
        userMessage: completedPair[0],
        assistantMessage,
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

    const reservation = await req.reserveAdditionalTokenUsage(messagesForAI);
    if (!reservation.allowed) {
      const remainingTime = reservation.ttl < 0 ? env.TOKEN_WINDOW_SECONDS : reservation.ttl;
      res.setHeader("Retry-After", String(Math.max(1, remainingTime)));
      return res.status(429).json({
        message: "Token limit reached. Please try after some time.",
        tokenUsed: reservation.tokenUsed,
        tokenLimit: env.TOKEN_LIMIT,
        retryAfter: remainingTime,
      });
    }

    const { aiReply, usage } = await generateAIResponse({
      model: chat.model,
      messages: messagesForAI,
      requestId: req.requestId,
    });

    if (req.reconcileTokenReservation) {
      await req.reconcileTokenReservation(usage.totalTokens);
    }
    const [userMessage, assistantMessage] = await persistMessagePair({
      chat,
      user: req.user,
      content: trimmedContent,
      aiReply,
      usage,
      clientRequestId,
    });

    // redis ke andar information ko daalna padega

    let tokenUsed = req.user.usage.tokenUsed;
    if (req.reconcileTokenReservation) {
      tokenUsed = Number(await redisClient.get(req.tokenUsageKey));
    }

    void updateSummaryIfNeeded(chat._id).catch((error) => {
      logError("summary.update_failed", { requestId: req.requestId }, error);
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
    if (req.reconcileTokenReservation && !req.tokenReservationSettled) {
      await req.reconcileTokenReservation(0).catch((releaseError) => {
        logError("token_usage.release_failed", { requestId: req.requestId }, releaseError);
      });
    }
    if (createdChat) {
      await Promise.all([
        Message.deleteMany({ chatId: createdChat._id }),
        Chat.deleteOne({ _id: createdChat._id, userId: req.user._id }),
      ]).catch((cleanupError) => {
        logError("chat.cleanup_failed", { requestId: req.requestId }, cleanupError);
      });
    }
    logError("message.request.failed", { requestId: req.requestId }, err);
    res.status(500).json({
      message: "Internal server error"
    });
  }
};

export const streamMessage = async (req, res) => {
  let chat;
  let stream;
  let operationTimer;
  let receivedFirstChunk = false;
  let clientDisconnected = false;
  const streamController = new AbortController();
  const onClientDisconnect = () => {
    clientDisconnected = true;
    streamController.abort(new Error("Client disconnected"));
  };
  const removeConnectionListeners = () => {
    req.removeListener("aborted", onClientDisconnect);
    res.removeListener("close", onClientDisconnect);
  };

  try {
    req.once("aborted", onClientDisconnect);
    res.once("close", onClientDisconnect);
    const resetStreamTimer = () => {
      if (operationTimer) clearTimeout(operationTimer);
      operationTimer = setTimeout(() => {
        streamController.abort(new Error(
          receivedFirstChunk
            ? "AI stream idle timeout"
            : "AI stream connection timed out"
        ));
      }, receivedFirstChunk
        ? env.AI_STREAM_IDLE_TIMEOUT_MS
        : env.AI_STREAM_FIRST_BYTE_TIMEOUT_MS);
    };
    resetStreamTimer();

    const { chatId } = req.params;
    const { content } = req.body;
    const model = typeof req.body.model === "string" ? req.body.model.trim() : "";
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "Message content is required" });
    }
    const trimmedContent = content.trim();
    if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
    }

    const clientRequestId = getIdempotencyKey(req);
    const completedPair = await findCompletedPair(req.user._id, clientRequestId);
    if (completedPair) {
      await releaseDuplicateReservation(req);
      const assistantMessage = completedPair[1];
      res.status(200).set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(`event: token\ndata: ${JSON.stringify({ content: assistantMessage.content })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ chatId: assistantMessage.chatId, usage: assistantMessage.usage, userMessageId: completedPair[0]._id, assistantMessageId: assistantMessage._id })}\n\n`);
      return res.end();
    }

    if (chatId) {
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({ message: "Invalid chat id" });
      }
      chat = await Chat.findOne({ _id: chatId, userId: req.user._id });
      if (!chat) return res.status(404).json({ message: "Chat not found" });
    } else {
      if (!allowedModels.has(model)) return res.status(400).json({ message: "Unsupported model" });
      chat = await Chat.create({ userId: req.user._id, model, topic: trimmedContent.slice(0, 40) });
    }

    const oldMessages = await Message.find({ chatId: chat._id })
      .sort({ createdAt: 1 })
      .skip(chat.summarizedTillMessageNumber);
    const messages = buildMessagesForAI({ chat, oldMessages, currentMessage: trimmedContent });
    const reservation = await req.reserveAdditionalTokenUsage(messages);
    if (!reservation.allowed) {
      const remainingTime = reservation.ttl < 0 ? env.TOKEN_WINDOW_SECONDS : reservation.ttl;
      res.setHeader("Retry-After", String(Math.max(1, remainingTime)));
      return res.status(429).json({
        message: "Token limit reached. Please try after some time.",
        tokenUsed: reservation.tokenUsed,
        tokenLimit: env.TOKEN_LIMIT,
        retryAfter: remainingTime,
      });
    }
    stream = await streamAIResponse({
      model: chat.model,
      messages,
      signal: streamController.signal,
    });
    if (clientDisconnected || streamController.signal.aborted) {
      throw streamController.signal.reason || new Error("Streaming request aborted");
    }
    const aiStartedAt = performance.now();
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let aiReply = "";
    let usage = null;
    await consumeAIStream({
      stream,
      signal: streamController.signal,
      onChunk: async (chunk) => {
        if (clientDisconnected || streamController.signal.aborted) {
          throw streamController.signal.reason || new Error("Streaming request aborted");
        }
        if (chunk?.error) throw new Error("AI provider returned an error");
        if (chunk?.choices?.[0]?.finish_reason === "error") throw new Error("AI provider returned an error");
        receivedFirstChunk = true;
        resetStreamTimer();
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) {
          aiReply += delta;
          res.write(`event: token\ndata: ${JSON.stringify({ content: delta })}\n\n`);
        }
        if (chunk.usage) {
          const promptTokens = Number(chunk.usage.promptTokens) || 0;
          const completionTokens = Number(chunk.usage.completionTokens) || 0;
          usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
        }
      },
    });

    if (!aiReply || clientDisconnected || streamController.signal.aborted) {
      throw streamController.signal.reason || new Error("AI response is empty");
    }
    if (!usage?.totalTokens) {
      const promptCharacters = messages.reduce(
        (total, message) => total + (typeof message.content === "string" ? message.content.length : 0),
        0,
      );
      const promptTokens = Math.max(1, Math.ceil(promptCharacters / 4));
      const completionTokens = Math.max(1, Math.ceil(aiReply.length / 4));
      usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
    }
    console.log(JSON.stringify({
      event: "ai.stream.complete",
      requestId: req.requestId,
      model: chat.model,
      durationMs: Math.round(performance.now() - aiStartedAt),
      totalTokens: usage.totalTokens,
    }));
    if (req.reconcileTokenReservation) {
      await req.reconcileTokenReservation(usage.totalTokens);
    }
    const persistedMessages = await persistMessagePair({ chat, user: req.user, content: trimmedContent, aiReply, usage, clientRequestId });
    void updateSummaryIfNeeded(chat._id).catch((error) => logError("summary.update_failed", { requestId: req.requestId }, error));
    res.write(`event: done\ndata: ${JSON.stringify({ chatId: chat._id, usage, userMessageId: persistedMessages[0]._id, assistantMessageId: persistedMessages[1]._id })}\n\n`);
    return res.end();
  } catch (error) {
    logError("message.stream.failed", { requestId: req.requestId }, error);
    if (req.reconcileTokenReservation && !req.tokenReservationSettled) {
      await req.reconcileTokenReservation(0).catch((releaseError) => {
        logError("token_usage.release_failed", { requestId: req.requestId }, releaseError);
      });
    }
    if (chat && !chat.messageCount) await Chat.deleteOne({ _id: chat._id, userId: req.user._id });
    if (res.headersSent && !clientDisconnected && !res.destroyed) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Unable to complete AI response" })}\n\n`);
      return res.end();
    }
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (operationTimer) clearTimeout(operationTimer);
    removeConnectionListeners();
  }
};