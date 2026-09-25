import nodemailer from "nodemailer";
import { env, smtpConfigured } from "./env.js";

let mailTransport;

const normalizeCredential = (value) => value.trim().replace(/\s+/g, "");

export const getMailTransport = () => {
    if (!smtpConfigured) throw new Error("SMTP is not configured");
    if (!mailTransport) {
        mailTransport = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            requireTLS: !env.SMTP_SECURE,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
            ...(env.SMTP_USER ? { auth: { user: normalizeCredential(env.SMTP_USER), pass: normalizeCredential(env.SMTP_PASSWORD) } } : {}),
        });
    }
    return mailTransport;
};

export const describeMailError = (error) => ({
    code: error?.code || error?.name || "UnknownError",
    command: error?.command || null,
    responseCode: error?.responseCode ?? null,
    response: typeof error?.response === "string" ? error.response.replace(/\s+/g, " ").slice(0, 200) : null,
});
