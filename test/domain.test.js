import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Message from "../model/messageSchema.js";
import { addUserTokenUsage } from "../utils/userUsage.js";

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
