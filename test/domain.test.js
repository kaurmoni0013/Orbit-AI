import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Message from "../model/messageSchema.js";
import { addUserTokenUsage } from "../utils/userUsage.js";
import openRouter from "../config/openRouter.js";
import { env } from "../config/env.js";
import { consumeAIStream, generateAIResponse } from "../service/openRouterService.js";

test("user token accounting updates window and lifetime totals", async () => {
    const user = {
        usage: {
            tokenUsed: 10,
            totalTokenUsed: 100,
        },
        save: async () => {},
    };

    await addUserTokenUsage(user, 25);

    assert.equal(user.usage.tokenUsed, 35);
    assert.equal(user.usage.totalTokenUsed, 125);
});

test("messages reject content larger than the API limit", async () => {
    const message = new Message({
        userId: new mongoose.Types.ObjectId(),
        chatId: new mongoose.Types.ObjectId(),
        role: "user",
        content: "x".repeat(12001),
    });

    const error = await message.validate().catch((validationError) => validationError);

    assert.equal(error?.errors.content.kind, "maxlength");
});

test("stream consumption stops and closes the iterator when aborted", async () => {
    const controller = new AbortController();
    let returned = false;
    const stream = {
        [Symbol.asyncIterator]() {
            return {
                next: () => new Promise(() => {}),
                return: async () => {
                    returned = true;
                    return { done: true };
                },
            };
        },
    };

    const pending = consumeAIStream({
        stream,
        signal: controller.signal,
        onChunk: async () => {},
    });
    controller.abort(new Error("test disconnect"));

    await assert.rejects(pending, { code: "STREAM_ABORTED" });
    assert.equal(returned, true);
});

test("provider timeout aborts the underlying request", async () => {
    const originalSend = openRouter.chat.send;
    const originalTimeout = env.AI_REQUEST_TIMEOUT_MS;
    const originalRetries = env.AI_MAX_RETRIES;
    let providerSignal;
    openRouter.chat.send = async (_payload, options) => {
        providerSignal = options.signal;
        return new Promise(() => {});
    };
    env.AI_REQUEST_TIMEOUT_MS = 10;
    env.AI_MAX_RETRIES = 0;

    try {
        await assert.rejects(
            generateAIResponse({ model: "test-model", messages: [] }),
            { code: "AI_REQUEST_TIMEOUT" },
        );
        assert.equal(providerSignal.aborted, true);
    } finally {
        openRouter.chat.send = originalSend;
        env.AI_REQUEST_TIMEOUT_MS = originalTimeout;
        env.AI_MAX_RETRIES = originalRetries;
    }
});

test("caller abort stops retries and aborts the provider request", async () => {
    const originalSend = openRouter.chat.send;
    const controller = new AbortController();
    let calls = 0;
    let providerSignal;
    openRouter.chat.send = async (_payload, options) => {
        calls += 1;
        providerSignal = options.signal;
        return new Promise((_, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        });
    };

    try {
        const pending = generateAIResponse({
            model: "test-model",
            messages: [],
            signal: controller.signal,
        });
        controller.abort(new Error("cancelled by caller"));
        await assert.rejects(pending, { code: "STREAM_ABORTED" });
        assert.equal(calls, 1);
        assert.equal(providerSignal.aborted, true);
    } finally {
        openRouter.chat.send = originalSend;
    }
});
