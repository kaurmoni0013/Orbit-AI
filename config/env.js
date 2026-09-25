import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess(
    (value) => {
        if (value === undefined || value === "") return undefined;
        return value === true || value === "true";
    },
    z.boolean(),
);

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGO_URL: z.string().trim().min(1, "MONGO_URL is required"),
    REDIS_URL: z.string().trim().min(1, "REDIS_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),
    CORS_ORIGINS: z.string().trim().default("http://localhost:5173"),
    APP_URL: z.string().url("APP_URL must be a valid URL").default("http://localhost:5173"),
    ALLOWED_MODELS: z.string().trim().min(1).default("openai/gpt-4o-mini"),
    AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    AI_STREAM_FIRST_BYTE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    AI_STREAM_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2048),
    AI_CONTEXT_CHAR_LIMIT: z.coerce.number().int().positive().default(24000),
    AI_SUMMARY_CHAR_LIMIT: z.coerce.number().int().positive().default(6000),
    SUMMARY_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(120),
    TOKEN_LIMIT: z.coerce.number().int().positive().default(10000),
    TOKEN_WINDOW_SECONDS: z.coerce.number().int().positive().default(18000),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    AUTH_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    UNAUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    UNAUTH_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_FAIL_OPEN: booleanFromEnv.default(false),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    SMTP_HOST: z.string().trim().default(""),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanFromEnv.default(false),
    SMTP_USER: z.string().trim().default(""),
    SMTP_PASSWORD: z.string().default(""),
    SMTP_FROM: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().trim().min(1).default("Orbit AI <no-reply@example.com>"),
    ),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
}).superRefine((value, context) => {
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
        context.addIssue({
            code: "custom",
            path: ["SMTP_USER"],
            message: "SMTP_USER and SMTP_PASSWORD must be configured together",
        });
    }

    if (value.SMTP_HOST && !value.SMTP_USER) {
        context.addIssue({
            code: "custom",
            path: ["SMTP_USER"],
            message: "SMTP_USER and SMTP_PASSWORD are required when SMTP_HOST is set (use an app password for Gmail)",
        });
    }

    if (value.NODE_ENV === "production") {
        if (value.JWT_SECRET.startsWith("replace-")) {
            context.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "JWT_SECRET must be replaced in production" });
        }
        if (value.OPENROUTER_API_KEY.startsWith("replace-")) {
            context.addIssue({ code: "custom", path: ["OPENROUTER_API_KEY"], message: "OPENROUTER_API_KEY must be replaced in production" });
        }
        if (!value.SMTP_HOST) {
            context.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP_HOST is required in production" });
        }
        if (value.CORS_ORIGINS.includes("localhost")) {
            context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS_ORIGINS must not include localhost" });
        }
    }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    const details = result.error.issues
        .map(({ path, message }) => `${path.join(".")}: ${message}`)
        .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = result.data;
export const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_FROM);
