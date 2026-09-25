import openRouter from "../config/openRouter.js";
import { env } from "../config/env.js";
import { assertAllowedModel } from "../config/allowedModels.js";

const sleep = (milliseconds, signal) => new Promise((resolve, reject) => {
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    cleanup();
    reject(abortError(signal.reason || "AI request aborted"));
  };
  timer = setTimeout(() => {
    cleanup();
    resolve();
  }, milliseconds);
  signal?.addEventListener("abort", onAbort, { once: true });
});

const isRetryableError = (error) => {
  if (error?.code === "STREAM_ABORTED") return false;
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
    if (signal.aborted) onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    cleanup: () => signal.removeEventListener("abort", onAbort),
  };
};

const requestCompletion = async ({ model, messages, signal }) => {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("AI provider request timed out");
      error.code = "AI_REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, env.AI_REQUEST_TIMEOUT_MS);
  });
  const aborted = createAbortPromise(signal);
  try {
    const request = openRouter.chat.send({
      chatRequest: {
        model,
        messages,
        maxTokens: env.AI_MAX_OUTPUT_TOKENS,
      },
    }, { signal: controller.signal });
    return await Promise.race([
      request,
      timeout,
      ...(aborted ? [aborted.promise] : []),
    ]);
  } finally {
    clearTimeout(timer);
    aborted?.cleanup();
    signal?.removeEventListener("abort", onAbort);
  }
};

export const streamAIResponse = async ({ model, messages, signal }) => {
  assertAllowedModel(model);
  const request = openRouter.chat.send({
    chatRequest: {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      maxTokens: env.AI_MAX_OUTPUT_TOKENS,
    },
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

export const generateAIResponse = async ({ model, messages, requestId = null, signal }) => {
  assertAllowedModel(model);
  const startedAt = performance.now();
  let completion;
  for (let attempt = 0; attempt <= env.AI_MAX_RETRIES; attempt += 1) {
    try {
      completion = await requestCompletion({ model, messages, signal });
      break;
    } catch (error) {
      if (signal?.aborted) throw abortError(signal.reason);
      if (attempt === env.AI_MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      await sleep(250 * (2 ** attempt), signal);
    }
  }

  const aiReply = completion?.choices?.[0]?.message?.content;

  if (typeof aiReply !== "string" || !aiReply.trim()) {
    throw new Error("AI response is empty");
  }

  const toTokenCount = (value) => {
    const tokens = Number(value);
    return Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : 0;
  };

  let promptTokens = toTokenCount(completion?.usage?.promptTokens);
  let completionTokens = toTokenCount(completion?.usage?.completionTokens);

  if (!promptTokens && !completionTokens) {
    const promptCharacters = messages.reduce(
      (total, message) => total + (typeof message.content === "string" ? message.content.length : 0),
      0,
    );
    promptTokens = Math.max(1, Math.ceil(promptCharacters / 4));
    completionTokens = Math.max(1, Math.ceil(aiReply.length / 4));
  }

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