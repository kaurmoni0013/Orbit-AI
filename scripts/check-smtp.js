import { env, smtpConfigured, httpMailConfigured, mailSender } from "../config/env.js";
import { getMailTransport, describeMailError } from "../config/mailer.js";

const MAIL_TO = process.env.MAIL_CHECK_RECIPIENT || env.SMTP_USER || "";

if (!smtpConfigured && !httpMailConfigured) {
    console.error(JSON.stringify({
        event: "mail.not_configured",
        hint: "Set either SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM, or RESEND_API_KEY with MAIL_FROM, in .env before checking",
    }));
    process.exit(1);
}

const printSendFailure = (error) => {
    console.error(JSON.stringify({ event: "mail.send_failed", ...describeMailError(error) }));
    if (error?.code === "EAUTH") {
        console.error(JSON.stringify({
            event: "mail.hint",
            hint: "Gmail rejected the credentials. Create a new App Password at https://myaccount.google.com/apppasswords (needs 2-Step Verification on that exact account) and use it without spaces. Account passwords and app passwords from a different Google account are always refused.",
        }));
    }
    if (["ETIMEDOUT", "ECONNREFUSED", "EDNS", "EAI_AGAIN", "ESOCKET"].includes(error?.code)) {
        console.error(JSON.stringify({
            event: "mail.hint",
            hint: `Could not reach ${env.SMTP_HOST}:${env.SMTP_PORT}. Check the host, port, and any firewall blocking outbound SMTP. Hosting providers such as Render block ports 25, 465, and 587 on free plans, so use RESEND_API_KEY there instead.`,
        }));
    }
    if (error?.code === "EHTTPMAIL") {
        console.error(JSON.stringify({
            event: "mail.hint",
            hint: "The HTTP mail provider rejected the request. Verify RESEND_API_KEY and that MAIL_FROM is a sender you have verified.",
        }));
    }
};

if (httpMailConfigured) {
    if (!MAIL_TO) {
        console.error(JSON.stringify({ event: "mail.check_skipped", hint: "Set MAIL_CHECK_RECIPIENT to send a real test message over the HTTP provider" }));
        process.exit(0);
    }
    const { sendMail } = await import("../config/mailer.js");
    try {
        const info = await sendMail({
            to: MAIL_TO,
            subject: "Orbit AI mail check",
            text: "This message confirms the Orbit AI HTTP mail provider is configured correctly.",
            html: "<p>This message confirms the Orbit AI HTTP mail provider is configured correctly.</p>",
        });
        console.log(JSON.stringify({ event: "mail.sent", provider: "http", from: mailSender, to: MAIL_TO, messageId: info?.messageId ?? null }));
        process.exit(0);
    } catch (error) {
        printSendFailure(error);
        process.exit(1);
    }
}

try {
    const info = await getMailTransport().verify();
    console.log(JSON.stringify({
        event: "smtp.verified",
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        accepted: info.accepted?.length ?? null,
    }));
    process.exit(0);
} catch (error) {
    console.error(JSON.stringify({ event: "smtp.verify_failed", ...describeMailError(error) }));
    if (error?.code === "EAUTH") {
        console.error(JSON.stringify({
            event: "smtp.hint",
            hint: "Gmail rejected the credentials. Create a new App Password at https://myaccount.google.com/apppasswords (needs 2-Step Verification on that exact account) and use it without spaces. Account passwords and app passwords from a different Google account are always refused.",
        }));
    }
    if (["ETIMEDOUT", "ECONNREFUSED", "EDNS", "EAI_AGAIN", "ESOCKET"].includes(error?.code)) {
        console.error(JSON.stringify({
            event: "smtp.hint",
            hint: `Could not reach ${env.SMTP_HOST}:${env.SMTP_PORT}. Check the host, port, and any firewall or VPN blocking outbound 587. Hosting providers such as Render block ports 25, 465, and 587 on free plans, so use RESEND_API_KEY there instead.`,
        }));
    }
    process.exit(1);
}
