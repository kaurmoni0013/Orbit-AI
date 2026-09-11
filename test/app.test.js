import test from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";

let server;
let baseUrl;

test.before(() => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
    server.close();
});

test("health endpoint reports service status", async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        status: "ok",
        service: "chatgpt-backend",
    });
});

test("security headers are enabled", async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.headers.get("x-powered-by"), null);
    assert.ok(response.headers.get("content-security-policy"));
});

test("readiness endpoint reports unavailable dependencies", async () => {
    const response = await fetch(`${baseUrl}/ready`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
    assert.equal(body.dependencies.database, "down");
    assert.equal(body.dependencies.redis, "down");
});

test("unknown routes return a consistent JSON error", async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
        message: "Route not found: GET /does-not-exist",
    });
});

test("protected routes reject requests without a session", async () => {
    const response = await fetch(`${baseUrl}/chat/getRecentChat`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
        message: "You need to login first",
    });
});

test("invalid JSON returns a client error", async () => {
    const response = await fetch(`${baseUrl}/user/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        message: "Invalid JSON request body",
    });
});
