import crypto from "node:crypto";

export const JWT_ISSUER = "orbit-ai";
export const JWT_AUDIENCE = "orbit-ai-web";

export const getTokenBlocklistKey = (token) => `blocklist:${crypto.createHash("sha256").update(token).digest("hex")}`;

export const jwtSignOptions = {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: crypto.randomUUID(),
};

export const jwtVerifyOptions = {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
};
