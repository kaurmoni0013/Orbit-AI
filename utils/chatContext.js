const SYSTEM_PROMPT = `
You are a helpful AI assistant.
Answer the user's question clearly and accurately.
If the user asks for code, provide clean and practical code.
If the user asks for explanation, explain in a simple and structured way.
If you are unsure, say that you are unsure instead of guessing.
Dont use abusive language, if user ask question related to something which
can harm other, don't answer it.
`;

import { env } from "../config/env.js";

export const buildMessagesForAI = ({ chat, oldMessages, currentMessage }) => {
  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
  ];

  if (chat.summary && chat.summary.trim() !== "") {
    messages.push({
      role: "system",
      content: `Previous conversation summary:\n${chat.summary}`,
    });
  }

  let contextLength = messages.reduce((total, message) => total + message.content.length, 0);
  const recentMessages = [];
  for (let index = oldMessages.length - 1; index >= 0; index -= 1) {
    const msg = oldMessages[index];
    if (contextLength + msg.content.length > env.AI_CONTEXT_CHAR_LIMIT) break;
    recentMessages.unshift(msg);
    contextLength += msg.content.length;
  }

  for (const msg of recentMessages) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  messages.push({
    role: "user",
    content: currentMessage,
  });

  return messages;
};