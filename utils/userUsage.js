import User from "../model/userSchema.js";

export const addUserTokenUsage = async (user, totalTokens, session) => {
    if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new Error("Invalid token usage");
    user.usage.tokenUsed += totalTokens;
    user.usage.totalTokenUsed += totalTokens;
    if (user._id) {
        const result = await User.updateOne(
            { _id: user._id },
            { $inc: { "usage.tokenUsed": totalTokens, "usage.totalTokenUsed": totalTokens } },
            session ? { session } : {},
        );
        if (result.matchedCount !== 1) throw new Error("User usage update failed");
        return;
    }
    await user.save(session ? { session } : undefined);
};
