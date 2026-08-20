import { OpenRouter } from '@openrouter/sdk';

if(!process.env.OPENROUTER_API_KEY){
    throw new Error("Open router API key is missing");

    const openRouter = new OpenRouter({
        apiKey:process.env.OPENROUTER_API_KEY,
    })
}

export default openRouter;
