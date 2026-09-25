import Chat from "../model/chatSchema.js";

export const addChatTokenUsage = async (chat, usage, session, { messageCountDelta = 0, topic } = {}) => {
  chat.usage.promptTokens += usage.promptTokens;
  chat.usage.completionTokens += usage.completionTokens;
  chat.usage.totalTokens += usage.totalTokens;
  chat.messageCount += messageCountDelta;
  if (topic !== undefined) chat.topic = topic;

  if (chat._id) {
    const increment = {
      "usage.promptTokens": usage.promptTokens,
      "usage.completionTokens": usage.completionTokens,
      "usage.totalTokens": usage.totalTokens,
    };
    if (messageCountDelta) increment.messageCount = messageCountDelta;
    const update = { $inc: increment };
    if (topic !== undefined) update.$set = { topic };
    const result = await Chat.updateOne({ _id: chat._id }, update, session ? { session } : {});
    if (result.matchedCount !== 1) throw new Error("Chat usage update failed");
    return;
  }
  await chat.save(session ? { session } : undefined);
};
