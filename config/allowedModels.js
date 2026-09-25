import { env } from "./env.js";

const allowedModels = new Set(
    env.ALLOWED_MODELS.split(",").map((model) => model.trim()).filter(Boolean),
);

export const assertAllowedModel = (model) => {
    if (!allowedModels.has(model)) {
        const error = new Error("Unsupported model");
        error.statusCode = 400;
        throw error;
    }
};

export { allowedModels };
