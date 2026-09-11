
export const addUserTokenUsage = async (user, totalTokens, session) => {
  user.usage.tokenUsed += totalTokens;
  user.usage.totalTokenUsed += totalTokens;
  await user.save(session ? { session } : undefined);
};