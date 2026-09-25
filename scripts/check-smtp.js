import { env, smtpConfigured } from "../config/env.js";
import { getMailTransport, describeMailError } from "../config/mailer.js";

if (!smtpConfigured) {
    console.error(JSON.stringify({
        event: "smtp.not_configured",
        hint: "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in .env before checking",
    }));
    process.exit(1);
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
    if (["ETIMEDOUT", "ECONNREFUSED", "EDNS", "EAI_AGAIN"].includes(error?.code)) {
        console.error(JSON.stringify({
            event: "smtp.hint",
            hint: `Could not reach ${env.SMTP_HOST}:${env.SMTP_PORT}. Check the host, port, and any firewall or VPN blocking outbound 587.`,
        }));
    }
    process.exit(1);
}
