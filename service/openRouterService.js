import openRouter from "../config/openRouter.js";
import { env } from "../config/env.js";

export const generateAIResponse = async ({ model, messages }) => {
  const request = openRouter.chat.send({
    chatRequest: {
      model, 
      messages,
    },
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("AI provider request timed out")), env.AI_REQUEST_TIMEOUT_MS);
  });
  const completion = await Promise.race([request, timeout]).finally(() => clearTimeout(timer));

  const aiReply = completion.choices[0]?.message?.content;

  if (!aiReply) {                                                  
    throw new Error("AI response is empty");
  }
 
  // input Token == Prompt Token
  // output Token == completeio Token
  const promptTokens = completion.usage?.promptTokens || 0;
  const completionTokens = completion.usage?.completionTokens || 0;

  return {
    aiReply,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  };
};