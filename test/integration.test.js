import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../app.js";
import openRouter from "../config/openRouter.js";
import { redisClient } from "../config/redis.js";
import User from "../model/userSchema.js";
import Chat from "../model/chatSchema.js";
import Message from "../model/messageSchema.js";
import { updateSummaryIfNeeded } from "../service/summaryService.js";
import { buildMessagesForAI } from "../utils/chatContext.js";
import { reserveTokenUsage } from "../utils/redisOperations.js";

const MODEL = "openai/gpt-4o-mini";
const PASSWORD = "StrongPassword!";
const redisValues = new Map();
const redisExpiries = new Map();
let providerMode = "success";
let server;
let baseUrl;
let mongo;
let originalRedisMethods;
let originalSend;
let providerCalls = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getCookie = (response) => {
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie, "expected an authentication cookie");
    return cookie.split(";")[0];
};

const request = (path, options = {}, cookie) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(options.headers || {}),
    },
});

const jsonRequest = (path, body, cookie, method = "POST") => request(path, {
    method,
    body: JSON.stringify(body),
}, cookie);

const signup = async (suffix) => {
    const response = await jsonRequest("/user/signup", {
        name: `Test ${suffix}`,
        age: 25,
        email: `${suffix}@example.com`,
        password: PASSWORD,
    });
    assert.equal(response.status, 201);
    return { cookie: getCookie(response), email: `${suffix}@example.com` };
};

const streamChunks = (chunks, usage = { promptTokens: 4, completionTokens: 6 }) => ({
    async *[Symbol.asyncIterator]() {
        for (const content of chunks) {
            yield { choices: [{ delta: { content } }] };
        }
        if (usage) yield { usage };
    },
});

const installRedisDouble = () => {
    const methods = ["get", "incr", "incrBy", "expire", "ttl", "set", "eval"];
    originalRedisMethods = Object.fromEntries(methods.map((method) => [method, redisClient[method]]));
    redisClient.get = async (key) => redisValues.get(key) ?? null;
    redisClient.incr = async (key) => {
        const value = Number(redisValues.get(key) || 0) + 1;
        redisValues.set(key, String(value));
        return value;
    };
    redisClient.incrBy = async (key, amount) => {
        const value = Number(redisValues.get(key) || 0) + amount;
        redisValues.set(key, String(value));
        return value;
    };
    redisClient.expire = async (key, seconds) => {
        redisExpiries.set(key, seconds);
        return 1;
    };
    redisClient.ttl = async (key) => redisExpiries.has(key) ? redisExpiries.get(key) : -1;
    redisClient.set = async (key, value, options = {}) => {
        if (options.NX && redisValues.has(key)) return null;
        redisValues.set(key, value);
        if (options.EX) redisExpiries.set(key, options.EX);
        return "OK";
    };
    redisClient.eval = async (_script, { keys, arguments: args }) => {
        const key = keys[0];
        const current = Number(redisValues.get(key) || 0);
        if (args.length === 1 && key.startsWith("rate-limit:")) {
            const next = current + 1;
            redisValues.set(key, String(next));
            if (next === 1 || !redisExpiries.has(key)) redisExpiries.set(key, Number(args[0]));
            return [next, redisExpiries.get(key)];
        }
        if (args.length === 3) {
            const amount = Number(args[0]);
            const limit = Number(args[1]);
            const ttl = redisExpiries.has(key) ? redisExpiries.get(key) : -1;
            if (current + amount > limit) return [0, current, ttl];
            redisValues.set(key, String(current + amount));
            if (ttl < 0) redisExpiries.set(key, Number(args[2]));
            return [1, current + amount, ttl];
        }
        if (args.length === 2 && key.startsWith("token-usage:")) {
            const adjusted = Math.max(0, current + Number(args[0]));
            redisValues.set(key, String(adjusted));
            if (!redisExpiries.has(key)) redisExpiries.set(key, Number(args[1]));
            return adjusted;
        }
        if (args.length === 1) {
            if (redisValues.get(key) === args[0]) redisValues.delete(key);
            return 1;
        }
        return 0;
    };
};

const installProviderDouble = () => {
    originalSend = openRouter.chat.send;
    openRouter.chat.send = async (payload) => {
        providerCalls += 1;
        if (providerMode === "failure") {
            throw new Error("provider unavailable");
        }
        if (providerMode === "stream-failure") {
            return {
                async *[Symbol.asyncIterator]() {
                    yield { choices: [{ delta: { content: "partial" } }] };
                    throw new Error("stream interrupted");
                },
            };
        }
        if (providerMode === "stream-error-chunk") {
            return {
                async *[Symbol.asyncIterator]() {
                    yield { choices: [{ delta: { content: "partial" } }] };
                    yield { error: { code: 500, message: "provider exploded" } };
                },
            };
        }
        if (providerMode === "stream-no-usage") {
            if (payload.chatRequest.stream) return streamChunks(["Hello without usage"], null);
            return { choices: [{ message: { content: "Hello without usage" } }] };
        }
        if (payload.chatRequest.stream) {
            return streamChunks(["Hello", " from Orbit"]);
        }
        return {
            choices: [{ message: { content: "Hello from Orbit" } }],
            usage: { promptTokens: 4, completionTokens: 6 },
        };
    };
};

test.before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    installRedisDouble();
    installProviderDouble();
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    openRouter.chat.send = originalSend;
    for (const [method, implementation] of Object.entries(originalRedisMethods)) {
        redisClient[method] = implementation;
    }
    await mongoose.disconnect();
    await mongo.stop();
    await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async () => {
    providerMode = "success";
    providerCalls = 0;
    redisValues.clear();
    redisExpiries.clear();
    await User.deleteMany({});
    await Chat.deleteMany({});
    await Message.deleteMany({});
});

test("signup, login, and authenticated profile use the JWT cookie", async () => {
    const created = await signup("cookie-user");
    const profile = await request("/user/profile", {}, created.cookie);
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).email, created.email);

    const login = await jsonRequest("/user/login", {
        email: created.email,
        password: PASSWORD,
    });
    assert.equal(login.status, 200);
    const loginProfile = await request("/user/profile", {}, getCookie(login));
    assert.equal(loginProfile.status, 200);
});

test("password recovery returns generic responses and resets only once", async () => {
    const user = await signup("reset-user");
    const unknownResponse = await jsonRequest("/user/forgot-password", { email: "missing@example.com" });
    assert.equal(unknownResponse.status, 202);
    assert.equal((await unknownResponse.json()).previewUrl, undefined);

    const response = await jsonRequest("/user/forgot-password", { email: user.email });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.match(body.message, /If an account exists/);
    assert.ok(body.previewUrl);
    const token = new URL(body.previewUrl).hash.slice("#token=".length);
    const stored = await User.findOne({ email: user.email }).select("+passwordResetTokenHash");
    assert.equal(stored.passwordResetTokenHash.length, 64);
    assert.notEqual(stored.passwordResetTokenHash, token);

    const oldSession = await request("/user/profile", {}, user.cookie);
    assert.equal(oldSession.status, 200);
    const reset = await jsonRequest("/user/reset-password", { token, password: "NewStrongPassword!" });
    assert.equal(reset.status, 200);

    const invalidatedSession = await request("/user/profile", {}, user.cookie);
    assert.equal(invalidatedSession.status, 401);
    const secondReset = await jsonRequest("/user/reset-password", { token, password: "AnotherStrongPassword!" });
    assert.equal(secondReset.status, 400);
    const login = await jsonRequest("/user/login", { email: user.email, password: "NewStrongPassword!" });
    assert.equal(login.status, 200);
});

test("login uses the same response for unknown accounts and wrong passwords", async () => {
    const unknown = await jsonRequest("/user/login", { email: "missing@example.com", password: "WrongPassword!" });
    assert.equal(unknown.status, 401);
    assert.equal((await unknown.json()).message, "Invalid credentials");

    const user = await signup("wrong-password");
    const wrong = await jsonRequest("/user/login", { email: user.email, password: "WrongPassword!" });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).message, "Invalid credentials");
});

test("protected routes reject requests without authentication", async () => {
    const response = await request("/chat/getRecentChat");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "You need to login first" });
});

test("invalid JWT cookies are cleared and require a new login", async () => {
    const staleToken = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString(), email: "stale@example.com" },
        "a-different-secret-that-is-not-the-configured-one",
        { expiresIn: "1h" },
    );

    const response = await request(
        "/user/profile",
        {},
        `token=${staleToken}`,
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Please login again" });
    assert.match(response.headers.get("set-cookie") || "", /token=;/);
});

test("users cannot access another user's chat", async () => {
    const owner = await signup("owner");
    const other = await signup("other");
    const created = await jsonRequest("/chat/createChat", { model: MODEL }, owner.cookie);
    const { chatId } = await created.json();

    const read = await request(`/chat/${chatId}`, {}, other.cookie);
    const send = await jsonRequest(`/msg/${chatId}`, { content: "private" }, other.cookie);
    const remove = await request(`/chat/${chatId}`, { method: "DELETE" }, other.cookie);

    assert.equal(read.status, 404);
    assert.equal(send.status, 404);
    assert.equal(remove.status, 403);
});

test("users cannot delete another user's account data", async () => {
    const owner = await signup("account-owner");
    const other = await signup("account-other");
    await jsonRequest("/msg", {
        model: MODEL,
        content: "Keep this data",
    }, owner.cookie);

    const response = await request("/user/delete", { method: "DELETE" }, other.cookie);

    assert.equal(response.status, 200);
    assert.equal(await User.countDocuments({ email: owner.email }), 1);
    assert.equal(await Chat.countDocuments({}), 1);
    assert.equal(await Message.countDocuments({}), 2);
});

test("chat deletion rolls back messages when the chat delete fails", async () => {
    const user = await signup("chat-rollback");
    const created = await jsonRequest("/msg", {
        model: MODEL,
        content: "Keep this chat",
    }, user.cookie);
    const { chatId } = await created.json();
    const originalDeleteOne = Chat.deleteOne;
    Chat.deleteOne = async () => {
        throw new Error("chat delete failed");
    };

    try {
        const response = await request(`/chat/${chatId}`, { method: "DELETE" }, user.cookie);
        assert.equal(response.status, 500);
    } finally {
        Chat.deleteOne = originalDeleteOne;
    }

    assert.equal(await Chat.countDocuments({ _id: chatId }), 1);
    assert.equal(await Message.countDocuments({ chatId }), 2);
});

test("account deletion rolls back chats and messages when user delete fails", async () => {
    const user = await signup("account-rollback");
    await jsonRequest("/msg", {
        model: MODEL,
        content: "Keep account data",
    }, user.cookie);
    const originalDeleteOne = User.deleteOne;
    User.deleteOne = async () => {
        throw new Error("user delete failed");
    };

    try {
        const response = await request("/user/delete", { method: "DELETE" }, user.cookie);
        assert.equal(response.status, 500);
    } finally {
        User.deleteOne = originalDeleteOne;
    }

    const savedUser = await User.findOne({ email: user.email });
    assert.ok(savedUser);
    assert.equal(await Chat.countDocuments({ userId: savedUser._id }), 1);
    assert.equal(await Message.countDocuments({ userId: savedUser._id }), 2);
});

test("account deletion rolls back when message deletion fails", async () => {
    const user = await signup("account-message-rollback");
    await jsonRequest("/msg", {
        model: MODEL,
        content: "Keep account data after message failure",
    }, user.cookie);
    const originalDeleteMany = Message.deleteMany;
    Message.deleteMany = async () => {
        throw new Error("message delete failed");
    };

    try {
        const response = await request("/user/delete", { method: "DELETE" }, user.cookie);
        assert.equal(response.status, 500);
    } finally {
        Message.deleteMany = originalDeleteMany;
    }

    const savedUser = await User.findOne({ email: user.email });
    assert.ok(savedUser);
    assert.equal(await Chat.countDocuments({ userId: savedUser._id }), 1);
    assert.equal(await Message.countDocuments({ userId: savedUser._id }), 2);
});

test("account deletion rolls back when chat deletion fails", async () => {
    const user = await signup("account-chat-rollback");
    await jsonRequest("/msg", {
        model: MODEL,
        content: "Keep account data after chat failure",
    }, user.cookie);
    const originalDeleteMany = Chat.deleteMany;
    Chat.deleteMany = async () => {
        throw new Error("chat delete failed");
    };

    try {
        const response = await request("/user/delete", { method: "DELETE" }, user.cookie);
        assert.equal(response.status, 500);
    } finally {
        Chat.deleteMany = originalDeleteMany;
    }

    const savedUser = await User.findOne({ email: user.email });
    assert.ok(savedUser);
    assert.equal(await Chat.countDocuments({ userId: savedUser._id }), 1);
    assert.equal(await Message.countDocuments({ userId: savedUser._id }), 2);
});

test("message creation persists the user/assistant pair and usage", async () => {
    const user = await signup("message-user");
    const response = await jsonRequest("/msg", {
        model: MODEL,
        content: "Explain testing",
    }, user.cookie);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.reply, "Hello from Orbit");
    assert.equal(body.usage.totalTokens, 10);
    assert.equal(body.userMessage.role, "user");
    assert.equal(body.assistantMessage.role, "assistant");
    assert.equal(await Message.countDocuments({ chatId: body.chatId }), 2);

    const chat = await Chat.findById(body.chatId);
    const savedUser = await User.findOne({ email: user.email });
    assert.equal(chat.messageCount, 2);
    assert.equal(chat.usage.totalTokens, 10);
    assert.equal(savedUser.usage.totalTokenUsed, 10);
});

test("retries replay a completed message without charging or calling the provider twice", async () => {
    const user = await signup("idempotent-message");
    const key = "retry-request-1234";
    const body = { model: MODEL, content: "Retry this safely" };
    const first = await request("/msg", {
        method: "POST",
        headers: { "x-idempotency-key": key },
        body: JSON.stringify(body),
    }, user.cookie);
    const firstBody = await first.json();
    const second = await request("/msg", {
        method: "POST",
        headers: { "x-idempotency-key": key },
        body: JSON.stringify(body),
    }, user.cookie);
    const secondBody = await second.json();

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(secondBody.reply, firstBody.reply);
    assert.equal(providerCalls, 1);
    assert.equal(await Message.countDocuments({ chatId: firstBody.chatId }), 2);
    const savedUser = await User.findOne({ email: user.email });
    assert.equal(savedUser.usage.totalTokenUsed, 10);
});

test("provider failure cleans up a newly created chat and messages", async () => {
    const user = await signup("failed-message");
    providerMode = "failure";
    const response = await jsonRequest("/msg", {
        model: MODEL,
        content: "This should fail",
    }, user.cookie);

    assert.equal(response.status, 500);
    assert.equal(await Chat.countDocuments({}), 0);
    assert.equal(await Message.countDocuments({}), 0);
    assert.equal(Number(redisValues.get(`token-usage:${(await User.findOne({ email: user.email }))._id}`) || 0), 0);
});

test("successful streaming persists exactly one complete assistant response", async () => {
    const user = await signup("stream-user");
    const response = await jsonRequest("/msg/stream", {
        model: MODEL,
        content: "Stream this",
    }, user.cookie);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /event: token/);
    assert.match(body, /Hello/);
    assert.match(body, /event: done/);
    const messages = await Message.find({}).sort({ createdAt: 1 });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].content, "Hello from Orbit");
});

test("streaming failure does not persist partial or duplicate messages", async () => {
    const user = await signup("failed-stream");
    providerMode = "stream-failure";
    const response = await jsonRequest("/msg/stream", {
        model: MODEL,
        content: "Disconnect this",
    }, user.cookie);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /event: error/);
    assert.equal(await Chat.countDocuments({}), 0);
    assert.equal(await Message.countDocuments({}), 0);
});

test("provider error chunks abort the stream without persisting content", async () => {
    const user = await signup("error-chunk-stream");
    providerMode = "stream-error-chunk";
    const response = await jsonRequest("/msg/stream", {
        model: MODEL,
        content: "Trigger a provider error",
    }, user.cookie);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /event: error/);
    assert.equal(body.includes("event: done"), false);
    assert.equal(await Chat.countDocuments({}), 0);
    assert.equal(await Message.countDocuments({}), 0);
    const databaseUser = await User.findOne({ email: user.email });
    assert.equal(databaseUser.usage.totalTokenUsed, 0);
});

test("streaming without provider usage still records estimated token usage", async () => {
    const user = await signup("stream-no-usage");
    providerMode = "stream-no-usage";
    const response = await jsonRequest("/msg/stream", {
        model: MODEL,
        content: "Estimate this",
    }, user.cookie);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /event: done/);
    const messages = await Message.find({}).sort({ createdAt: 1 });
    assert.equal(messages.length, 2);
    const chat = await Chat.findById(messages[0].chatId);
    assert.equal(chat.usage.totalTokens > 0, true);
    assert.equal(chat.usage.totalTokens, chat.usage.promptTokens + chat.usage.completionTokens);
    const databaseUser = await User.findOne({ email: user.email });
    assert.equal(databaseUser.usage.totalTokenUsed, chat.usage.totalTokens);
});

test("token and request limits reject work before the provider is called", async () => {
    const user = await signup("limited-user");
    const databaseUser = await User.findOne({ email: user.email });
    const tokenKey = `token-usage:${databaseUser._id}`;
    redisValues.set(tokenKey, "10000");
    const tokenResponse = await jsonRequest("/msg", {
        model: MODEL,
        content: "over quota",
    }, user.cookie);
    assert.equal(tokenResponse.status, 429);
    assert.equal(providerCalls, 0);

    redisValues.delete(tokenKey);
    redisValues.set(`rate-limit:user:${databaseUser._id}`, "20");
    const rateResponse = await request("/chat/getRecentChat", {}, user.cookie);
    assert.equal(rateResponse.status, 429);
    assert.equal(providerCalls, 0);
});

test("concurrent token reservations never exceed the configured quota", async () => {
    const key = "token-usage:concurrent-user";
    const reservations = await Promise.all(
        Array.from({ length: 4 }, () => reserveTokenUsage(key, 3000)),
    );

    assert.equal(reservations.filter(({ allowed }) => allowed).length, 3);
    assert.equal(Number(redisValues.get(key)), 9000);
});

test("summary generation updates the chat and context stays within its configured limit", async () => {
    const user = await signup("summary-user");
    const chat = await Chat.create({
        userId: (await User.findOne({ email: user.email }))._id,
        model: MODEL,
        messageCount: 20,
    });
    await Message.insertMany(Array.from({ length: 20 }, (_, index) => ({
        userId: chat.userId,
        chatId: chat._id,
        role: index % 2 ? "assistant" : "user",
        content: `message-${index}`,
    })));

    await updateSummaryIfNeeded(chat._id);
    const summarized = await Chat.findById(chat._id);
    assert.equal(summarized.summarizedTillMessageNumber, 20);
    assert.equal(summarized.summary, "Hello from Orbit");

    const context = buildMessagesForAI({
        chat: { summary: "", summarizedTillMessageNumber: 0 },
        oldMessages: [{ role: "user", content: "x".repeat(30000) }],
        currentMessage: "latest",
    });
    assert.equal(context.at(-1).content, "latest");
    assert.equal(context.some((message) => message.content.length === 30000), false);
});

test("concurrent summary jobs claim a range only once", async () => {
    const user = await signup("summary-lock-user");
    const chat = await Chat.create({
        userId: (await User.findOne({ email: user.email }))._id,
        model: MODEL,
        messageCount: 20,
    });
    await Message.insertMany(Array.from({ length: 20 }, (_, index) => ({
        userId: chat.userId,
        chatId: chat._id,
        role: index % 2 ? "assistant" : "user",
        content: `message-${index}`,
    })));
    const originalSummarySend = openRouter.chat.send;
    openRouter.chat.send = async () => {
        await sleep(25);
        providerCalls += 1;
        return {
            choices: [{ message: { content: "Locked summary" } }],
            usage: { promptTokens: 2, completionTokens: 3 },
        };
    };
    try {
        await Promise.all([updateSummaryIfNeeded(chat._id), updateSummaryIfNeeded(chat._id)]);
    } finally {
        openRouter.chat.send = originalSummarySend;
    }
    const summarized = await Chat.findById(chat._id);
    assert.equal(providerCalls, 1);
    assert.equal(summarized.summarizedTillMessageNumber, 20);
    assert.equal(summarized.usage.totalTokens, 5);
    const databaseUser = await User.findById(chat.userId);
    assert.equal(databaseUser.usage.totalTokenUsed, 5);
    assert.equal(Number(redisValues.get(`token-usage:${chat.userId}`)), 5);
});

test("chat and account deletion remove related messages and chats", async () => {
    const user = await signup("deletion-user");
    const created = await jsonRequest("/msg", {
        model: MODEL,
        content: "Delete me",
    }, user.cookie);
    const { chatId } = await created.json();

    const deleteChat = await request(`/chat/${chatId}`, { method: "DELETE" }, user.cookie);
    assert.equal(deleteChat.status, 200);
    assert.equal(await Chat.countDocuments({}), 0);
    assert.equal(await Message.countDocuments({}), 0);

    await jsonRequest("/msg", { model: MODEL, content: "Delete account data" }, user.cookie);
    const deleteAccount = await request("/user/delete", { method: "DELETE" }, user.cookie);
    assert.equal(deleteAccount.status, 200);
    assert.equal(await User.countDocuments({}), 0);
    assert.equal(await Chat.countDocuments({}), 0);
    assert.equal(await Message.countDocuments({}), 0);
});

test("chat owners can rename and pin chats, while other users cannot", async () => {
    const owner = await signup("chat-actions-owner");
    const other = await signup("chat-actions-other");
    const first = await jsonRequest("/msg", {
        model: MODEL,
        content: "First conversation",
    }, owner.cookie);
    const firstBody = await first.json();
    const second = await jsonRequest("/msg", {
        model: MODEL,
        content: "Second conversation",
    }, owner.cookie);
    const secondBody = await second.json();

    const rename = await jsonRequest(`/chat/${firstBody.chatId}`, { topic: "Important project" }, owner.cookie, "PATCH");
    assert.equal(rename.status, 200);
    assert.equal((await rename.json()).topic, "Important project");

    const pin = await jsonRequest(`/chat/${firstBody.chatId}/pin`, {}, owner.cookie);
    assert.equal(pin.status, 200);
    assert.equal((await pin.json()).pinned, true);

    const chats = await request("/chat/getRecentChat", {}, owner.cookie);
    const listed = await chats.json();
    assert.equal(listed.chats[0]._id, firstBody.chatId);
    assert.equal(listed.chats[0].topic, "Important project");
    assert.equal(listed.chats[0].pinned, true);

    const otherRename = await jsonRequest(`/chat/${firstBody.chatId}`, { topic: "Not allowed" }, other.cookie, "PATCH");
    const otherPin = await jsonRequest(`/chat/${secondBody.chatId}/pin`, {}, other.cookie);
    assert.equal(otherRename.status, 404);
    assert.equal(otherPin.status, 404);
});
