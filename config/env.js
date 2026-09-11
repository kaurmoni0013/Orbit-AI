import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGO_URL: z.string().trim().min(1, "MONGO_URL is required"),
    REDIS_URL: z.string().trim().min(1, "REDIS_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),
    CORS_ORIGINS: z.string().trim().default("http://localhost:5173"),
    TOKEN_LIMIT: z.coerce.number().int().positive().default(10000),
    TOKEN_WINDOW_SECONDS: z.coerce.number().int().positive().default(18000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    const details = result.error.issues
        .map(({ path, message }) => `${path.join(".")}: ${message}`)
        .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = result.data;
