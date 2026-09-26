import nodemailer from "nodemailer";
import { env, smtpConfigured, httpMailConfigured, mailSender } from "./env.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const HTTP_MAIL_TIMEOUT_MS = 15000;

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

const postHttpMail = async (message) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_MAIL_TIMEOUT_MS);
    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: mailSender,
                to: Array.isArray(message.to) ? message.to : [message.to],
                subject: message.subject,
                text: message.text,
                html: message.html,
            }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error("HTTP mail provider rejected the request");
            error.code = "EHTTPMAIL";
            error.responseCode = response.status;
            error.response = payload?.message || payload?.name || response.statusText;
            throw error;
        }
        return { messageId: payload?.id ?? null, accepted: [message.to] };
    } finally {
        clearTimeout(timeout);
    }
};

export const sendMail = async (message) => {
    if (httpMailConfigured) return postHttpMail(message);
    return getMailTransport().sendMail({ from: mailSender, ...message });
};

export const describeMailError = (error) => ({
    code: error?.code || error?.name || "UnknownError",
    command: error?.command || null,
    responseCode: error?.responseCode ?? null,
    response: typeof error?.response === "string" ? error.response.replace(/\s+/g, " ").slice(0, 200) : null,
});
