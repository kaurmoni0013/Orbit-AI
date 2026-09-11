import openRouter from "../config/openRouter.js";
import { env } from "../config/env.js";

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const isRetryableError = (error) => {
  const status = error?.status || error?.statusCode;
  return !status || status === 408 || status === 429 || status >= 500;
};

const requestCompletion = async ({ model, messages }) => {
  const request = openRouter.chat.send({
    chatRequest: {
      model,
      messages,
    },
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("AI provider request timed out")),
      env.AI_REQUEST_TIMEOUT_MS
    );
  });

  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
};

export const generateAIResponse = async ({ model, messages }) => {
  let completion;
  for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt += 1) {
    try {
      completion = await requestCompletion({ model, messages });
      break;
    } catch (error) {
      if (attempt === env.AI_MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      await sleep(250 * (2 ** attempt));
    }
  }

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