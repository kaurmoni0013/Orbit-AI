import { z } from "zod";

const emailSchema = z.preprocess(
    (value) => typeof value === "string" ? value.trim().toLowerCase() : "",
    z.email("Email must be valid"),
);

const passwordSchema = z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character");

export const signupSchema = z.object({
    name: z.string()
        .trim()
        .min(3, "Minimum length of name should be 3")
        .max(30, "Maximum length of name should be 30"),
    age: z.number()
        .min(10, "Minimum age should be 10")
        .max(100, "Maximum age should be 100")
        .optional(),
    email: emailSchema,
    password: passwordSchema,
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required").max(128),
});

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

export const resetPasswordSchema = z.object({
    token: z.string().trim().min(32, "Reset token is invalid"),
    password: passwordSchema,
});
