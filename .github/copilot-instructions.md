# Copilot instructions for Orbit Arena

## Project shape

Orbit Arena is a full-stack AI chat workspace:

- The repository root contains an ES module Node.js 22 API built with Express 5.
- `client/` contains the React 19/Vite frontend. It calls the API through `client/src/api.js` with `credentials: "include"` so the JWT cookie is sent.
- MongoDB stores users, chats, and messages through Mongoose. Redis provides request rate limits, logout token blocklisting, and per-user token quotas.
- OpenRouter is the model provider. `service/openRouterService.js` normalizes provider responses into `{ aiReply, usage }`; message and summary flows both use this service.
- `index.js` is the production entry point: it connects MongoDB and Redis before listening and handles SIGINT/SIGTERM shutdown. `app.js` configures middleware, health/readiness endpoints, routers, and error handling without starting a listener, which allows the HTTP tests to import it directly.

Request flow is organized as router -> middleware -> controller -> model/service. User routes handle authentication; chat and message routes require authentication. Authenticated routes commonly apply Redis-backed request limiting, and message creation additionally checks the token quota and loads the current user. Message creation builds context from the chat summary plus unsummarized messages, calls OpenRouter, persists both message records, and updates usage counters. Summarization is intended to compact every 20 messages into the chat summary.

## Commands

Run commands from the repository root unless noted.

```powershell
# Install backend dependencies
npm install

# Run the backend with automatic reload
npm run dev

# Run the backend
npm start

# Run all backend tests
npm test

# Run the backend test file only
node --test test/app.test.js

# Run one named backend test
node --test --test-name-pattern="health endpoint reports service status"

# Check JavaScript syntax used by CI
npm run check

# Install and build the frontend
cd client
npm install
npm run build

# Serve the production frontend build locally
npm run preview
```

The frontend currently has no test or lint script. CI runs `npm ci`, `npm test`, and `npm run check` for the backend, and `npm ci` plus `npm run build` in `client/`. Docker Compose starts MongoDB, Redis, the API on port 3000, and the frontend on port 5173.

## Configuration

Copy `.env.example` to `.env` for the API and `client/.env.example` to `client/.env` for the frontend. The API validates its environment at import time in `config/env.js`; `MONGO_URL`, `REDIS_URL`, `JWT_SECRET` (at least 32 characters), and `OPENROUTER_API_KEY` are required. Set `CORS_ORIGINS` to the browser origin(s), comma-separated when needed. `VITE_API_URL` controls the frontend API base URL.

## Repository-specific conventions

- Keep the project in native ES modules: use `import`/`export` and include `.js` extensions in backend relative imports.
- Keep `app.js` side-effect-light and testable; connection startup belongs in `index.js`, not in route/controller modules.
- Routers own middleware ordering. Preserve authentication before `req.userId`-dependent middleware, and preserve `loadUserMiddleware` before controllers that use `req.user`.
- Controllers return the existing JSON response shapes and status-code conventions. Validate request body fields and MongoDB IDs before database operations, and scope chat/message queries by the authenticated user.
- Use the shared Mongoose models and indexes rather than issuing ad hoc persistence logic. Chat history is chronological; message retrieval and AI context use `createdAt` ascending order.
- Treat Redis as an optimization/protection layer: rate-limit and token-usage middleware logs Redis errors and calls `next()` so Redis outages do not block ordinary requests. Do not silently bypass authentication or persistence errors.
- Record provider token usage whenever an AI call is made. Message generation updates both chat and user usage and increments the Redis quota key; summary generation also contributes usage to the stored totals.
- Frontend API calls should go through `client/src/api.js`, which supplies JSON headers, credentials, and the repository's standard `body.message` error handling. Use `VITE_API_URL` rather than hard-coding a deployment URL.
- Keep generated frontend output (`client/dist`) and local secrets/config files out of commits; they are ignored by the repository.
