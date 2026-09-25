import { OpenRouter } from '@openrouter/sdk';
import { env } from "./env.js";

const openRouter = new OpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
});

export default openRouter; 