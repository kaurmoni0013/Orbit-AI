import openRouter from "../config/openRouter.js";
import { env } from "../config/env.js";

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const isRetryableError = (error) => {
  const status = error?.status || error?.statusCode;
  return !status || status === 408 || status === 429 || status >= 500;
};

const abortError = (reason = "Streaming request aborted") => {
  const error = reason instanceof Error ? reason : new Error(reason);
  error.code = error.code || "STREAM_ABORTED";
  return error;
};

const createAbortPromise = (signal) => {
  if (!signal) return null;
  let onAbort;
  const promise = new Promise((_, reject) => {
    onAbort = () => reject(abortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    cleanup: () => signal.removeEventListener("abort", onAbort),
  };
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

export const streamAIResponse = async ({ model, messages, signal }) => {
  const request = openRouter.chat.send({
    chatRequest: { model, messages, stream: true },
  }, { signal });
  const aborted = createAbortPromise(signal);
  if (!aborted) return request;
  try {
    return await Promise.race([request, aborted.promise]);
  } finally {
    aborted.cleanup();
  }
};

export const consumeAIStream = async ({ stream, signal, onChunk }) => {
  const iterator = stream[Symbol.asyncIterator]();
  const aborted = createAbortPromise(signal);
  try {
    while (true) {
      const nextResult = aborted
        ? await Promise.race([iterator.next(), aborted.promise])
        : await iterator.next();
      if (nextResult.done) return;
      await onChunk(nextResult.value);
    }
  } finally {
    if (aborted) aborted.cleanup();
    if (typeof iterator.return === "function") {
      await iterator.return();
    }
  }
};

export const generateAIResponse = async ({ model, messages, requestId = null }) => {
  const startedAt = performance.now();
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

  const result = {
    aiReply,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  };
  console.log(JSON.stringify({
    event: "ai.response",
    requestId,
    model,
    durationMs: Math.round(performance.now() - startedAt),
    totalTokens: result.usage.totalTokens,
  }));
  return result;
};