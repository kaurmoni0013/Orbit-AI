import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../model/userSchema.js";
import Chat from "../../model/chatSchema.js";
import Message from "../../model/messageSchema.js";
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../../validators/userValidator.js";
import { redisClient } from "../redis.js";
import { env, smtpConfigured } from "../env.js";
import { getMailTransport, describeMailError } from "../mailer.js";
import { getTokenBlocklistKey, jwtSignOptions } from "../../utils/token.js";

const DUMMY_PASSWORD_HASH = "$2b$12$ESui7L4r0HKuEq/4MSAJyu3mQWtrm9.5I6.fLcfpBiz2bHGQ8a2rS";
const RESET_TOKEN_BYTES = 32;

const cookiesOption = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    maxAge: 60 * 60 * 1000,
};

const clearTokenCookie = (res) => {
    res.clearCookie("token", {
        httpOnly: cookiesOption.httpOnly,
        secure: cookiesOption.secure,
        sameSite: cookiesOption.sameSite,
        path: cookiesOption.path,
    });
};

const reportError = (req, event, error, extra = {}) => {
    console.error(JSON.stringify({
        event,
        requestId: req.requestId,
        error: error?.name || "UnknownError",
        ...extra,
    }));
};

const createToken = (user) => jwt.sign(
    { id: user._id.toString(), email: user.email, sv: user.sessionVersion || 0 },
    env.JWT_SECRET,
    jwtSignOptions,
);

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const createResetLink = (token) => {
    const url = new URL("/reset-password", env.APP_URL);
    url.hash = `token=${encodeURIComponent(token)}`;
    return url.toString();
};

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}[character]));

const sendPasswordResetEmail = async ({ email, resetLink }) => {
    const safeLink = escapeHtml(resetLink);
    await getMailTransport().sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject: "Reset your Orbit AI password",
        text: `Reset your Orbit AI password using this link: ${resetLink}\n\nThis link expires in ${env.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes. If you did not request it, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Reset your Orbit AI password</h2><p>Use the secure link below to choose a new password.</p><p><a href="${safeLink}">Reset password</a></p><p>This link expires in ${env.PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes. If you did not request it, you can ignore this email.</p></div>`,
    });
};

export const signup = async (req, res) => {
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ message: result.error.issues[0].message });
    }

    try {
        const { name, age, email, password } = result.data;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(409).json({ message: "Email ID already exist" });

        const passwordHash = await bcrypt.hash(password, 12);
        const userCreated = await User.create({ name, age, email, password: passwordHash });
        const token = createToken(userCreated);
        res.cookie("token", token, cookiesOption);
        res.set("Cache-Control", "no-store");
        return res.status(201).json({
            message: "User created successfully",
            name: userCreated.name,
            age: userCreated.age,
            email: userCreated.email,
        });
    } catch (error) {
        reportError(req, "user.signup.failed", error);
        if (error?.code === 11000) return res.status(409).json({ message: "Email ID already exist" });
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const login = async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ message: result.error.issues[0].message });
    }

    try {
        const { email, password } = result.data;
        const existingUser = await User.findOne({ email });
        const passwordMatches = await bcrypt.compare(password, existingUser?.password || DUMMY_PASSWORD_HASH);
        if (!existingUser || !passwordMatches) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = createToken(existingUser);
        res.cookie("token", token, cookiesOption);
        res.set("Cache-Control", "no-store");
        return res.status(200).json({
            message: "User logged in successfully",
            name: existingUser.name,
            age: existingUser.age,
            email: existingUser.email,
            usage: existingUser.usage,
        });
    } catch (error) {
        reportError(req, "user.login.failed", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const forgotPassword = async (req, res) => {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: result.error.issues[0].message });

    let previewUrl;
    let emailSent = false;
    try {
        const user = await User.findOne({ email: result.data.email });
        if (user) {
            const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
            user.passwordResetTokenHash = hashResetToken(rawToken);
            user.passwordResetRequestedAt = new Date();
            user.passwordResetExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
            await user.save();
            previewUrl = createResetLink(rawToken);
            if (smtpConfigured) {
                try {
                    await sendPasswordResetEmail({ email: user.email, resetLink: previewUrl });
                    emailSent = true;
                } catch (error) {
                    reportError(req, "user.password_reset.email_failed", error, describeMailError(error));
                }
            }
        }

        res.set("Cache-Control", "no-store");
        const isLocal = env.NODE_ENV !== "production";
        return res.status(202).json({
            message: "If an account exists for that email, a password reset link has been sent.",
            ...(isLocal && smtpConfigured && user ? { emailSent } : {}),
            ...(isLocal && previewUrl && (!smtpConfigured || !emailSent) ? { previewUrl } : {}),
        });
    } catch (error) {
        reportError(req, "user.password_reset.request_failed", error);
        return res.status(500).json({ message: "Unable to process password reset request" });
    }
};

export const resetPassword = async (req, res) => {
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ message: result.error.issues[0].message });

    try {
        const tokenHash = hashResetToken(result.data.token);
        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: { $gt: new Date() },
        }).select("+passwordResetTokenHash");
        if (!user) return res.status(400).json({ message: "This reset link is invalid or expired." });

        const passwordHash = await bcrypt.hash(result.data.password, 12);
        user.password = passwordHash;
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        user.passwordResetRequestedAt = null;
        user.sessionVersion = (user.sessionVersion || 0) + 1;
        await user.save();
        clearTokenCookie(res);
        res.set("Cache-Control", "no-store");
        return res.status(200).json({ message: "Password reset successfully. Sign in with your new password." });
    } catch (error) {
        reportError(req, "user.password_reset.reset_failed", error);
        return res.status(500).json({ message: "Unable to reset password" });
    }
};

export const logout = async (req, res) => {
    try {
        if (req.token) {
            const remainingTime = req.tokenPayload.exp - Math.floor(Date.now() / 1000);
            if (remainingTime > 0) {
                try {
                    await redisClient.set(getTokenBlocklistKey(req.token), "blocked", { EX: remainingTime });
                } catch (error) {
                    clearTokenCookie(res);
                    reportError(req, "user.logout.blocklist_failed", error);
                    return res.status(503).json({ message: "Logout is temporarily unavailable" });
                }
            }
        }
        clearTokenCookie(res);
        res.set("Cache-Control", "no-store");
        return res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        clearTokenCookie(res);
        reportError(req, "user.logout.failed", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const profile = async (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
        name: req.user.name,
        age: req.user.age,
        usage: req.user.usage,
        email: req.user.email,
    });
};

export const deleteAccount = async (req, res) => {
    const userId = req.user._id;
    const session = await User.startSession();
    try {
        await session.withTransaction(async () => {
            await Message.deleteMany({ userId }, { session });
            await Chat.deleteMany({ userId }, { session });
            const deletedUser = await User.deleteOne({ _id: userId }, { session });
            if (deletedUser.deletedCount !== 1) throw new Error("Account deletion did not remove the authenticated user");
        });
        clearTokenCookie(res);
        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        reportError(req, "user.delete.failed", error);
        return res.status(500).json({ message: "Internal server error" });
    } finally {
        await session.endSession();
    }
};
