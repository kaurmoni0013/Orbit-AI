<div align="center">
  <img src="docs/assets/orbit-banner.svg" alt="Orbit AI — Make room for better questions" width="100%" />
  <p><strong>A quiet workspace for questions, drafts, and useful next steps.</strong></p>
  <p>
    <a href="https://github.com/kaurmoni0013/orbit-arena/actions/workflows/ci.yml"><img src="https://github.com/kaurmoni0013/orbit-arena/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
    <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=20232a" alt="React 19" />
    <img src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white" alt="Express 5" />
    <img src="https://img.shields.io/badge/MongoDB-8-47a248?style=flat-square&logo=mongodb&logoColor=white" alt="MongoDB 8" />
    <img src="https://img.shields.io/badge/Redis-7-d82c20?style=flat-square&logo=redis&logoColor=white" alt="Redis 7" />
    <img src="https://img.shields.io/badge/OpenRouter-7c5cff?style=flat-square" alt="OpenRouter" />
    <img src="https://img.shields.io/badge/Docker-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  </p>
</div>

---

## The idea

Orbit AI is a full-stack conversation workspace for people who want more than a one-off prompt box. It keeps the interface quiet, the history useful, and the response immediate—so thinking can turn into momentum.

The product is built around three ideas:

- **Stay in context.** Conversations, messages, summaries, and usage totals persist in MongoDB.
- **Stay in control.** Stop a response, retry safely, search chats, rename threads, and pin important conversations.
- **Stay production-minded.** Redis-backed limits, token reservations, request IDs, readiness checks, model allowlists, password recovery, and graceful shutdown are part of the foundation.

Orbit scopes every chat and message query to the authenticated user. It is not end-to-end encrypted, so review important AI output and use it responsibly.

## At a glance

| Layer | Choice | Role |
| --- | --- | --- |
| Experience | React 19 + Vite 7 | Responsive auth flow, themes, search, streaming reader, and conversation workspace |
| API | Node.js 22 + Express 5 | Authenticated routes, validation, orchestration, recovery, and health endpoints |
| Persistence | MongoDB 8 replica set | Users, chats, messages, summaries, and usage records |
| Coordination | Redis 7 | Rate limits, token windows, logout revocation, summary locks, and atomic reservations |
| Intelligence | OpenRouter | Allowlisted completion and streaming model access |
| Delivery | Docker Compose | Repeatable API, Nginx-served client, MongoDB replica set, and Redis stack |

## Product preview

The interface is an editorial knowledge workspace: restrained surfaces, a dark-first palette, a light theme, compact metadata, and a conversation surface that adapts to smaller screens.

<img src="docs/assets/orbit-workspace-preview.svg" alt="Orbit AI workspace interface preview" width="100%" />

<p align="center"><em>Make room for better questions.</em></p>

## Highlights

| Capability | What it does |
| --- | --- |
| Streaming responses | Uses Server-Sent Events so tokens appear as they are generated, with first-byte and idle timeouts. |
| Persistent workspace | Stores users, chats, messages, summaries, model metadata, and token totals in MongoDB. |
| Conversation memory | Builds bounded context from the chat summary plus unsummarized messages and summarizes as history grows. |
| Authentication | Uses an HttpOnly JWT cookie, bcrypt password hashing, session-version invalidation, and logout token revocation. |
| Password recovery | Sends a generic response, stores only a SHA-256 token hash, expires links, and invalidates existing sessions after reset. |
| Safe retries | Accepts an `x-idempotency-key` and replays a completed request without calling the provider or charging usage twice. |
| Protection layer | Adds Redis-backed request limits, atomic token reservations, quota windows, and expiring summary locks. |
| Thoughtful controls | Supports search, rename, pin, delete, dark/light themes, Stop, Retry, responsive navigation, and structured Markdown responses. |
| Safe AI integration | Allows only model IDs listed in `ALLOWED_MODELS`, limits message size, records provider usage, and aborts disconnected streams. |
| Operational readiness | Includes `/health`, `/ready`, request IDs, Helmet, CORS allowlisting, JSON limits, and graceful SIGINT/SIGTERM shutdown. |

## Architecture

```mermaid
flowchart LR
  Browser[React + Vite client] -->|JSON and SSE| API[Express API]
  API --> Middleware[Auth · validation · rate limits · quota]
  Middleware --> Context[Context builder]
  Context --> Provider[OpenRouter]
  Provider -->|token events| Stream[SSE response]
  Stream --> Browser
  API --> Mongo[(MongoDB replica set)]
  API --> Redis[(Redis)]
```

The request path is intentionally explicit:

1. The client sends an authenticated request with `credentials: include` and an optional idempotency key.
2. Middleware validates the session, rate limit, model, message size, and token reservation.
3. The context builder combines the existing summary with recent unsummarized messages.
4. OpenRouter streams a response back through the API as Server-Sent Events.
5. The API persists the user/assistant pair and usage totals in one MongoDB transaction only after the stream completes successfully.
6. A retry with the same idempotency key replays the completed pair instead of generating or charging a second response.

<details>
<summary>Streaming sequence</summary>

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Express API
  participant R as Redis
  participant M as MongoDB
  participant O as OpenRouter

  B->>A: POST /msg/:chatId/stream
  A->>R: Reserve token window
  A->>M: Load chat and recent messages
  A->>O: Request streamed completion
  O-->>A: Token chunks
  A-->>B: event: token
  A->>M: Transactionally persist pair and usage
  A->>R: Reconcile actual token usage
  A-->>B: event: done with message IDs
```

A client disconnect or provider failure releases the reservation, aborts the provider request, and does not persist a partial response.

</details>

## Quick start

### Prerequisites

- Node.js 22+
- npm 10+
- MongoDB 8 configured as a replica set
- Redis 7
- An OpenRouter API key
- Docker Desktop for the Compose path

### Run locally

**1. Configure the API**

```bash
git clone https://github.com/kaurmoni0013/orbit-arena.git
cd orbit-arena
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Set at least these values in `.env`:

```dotenv
NODE_ENV=development
MONGO_URL=mongodb://localhost:27017/orbit-ai?replicaSet=rs0
REDIS_URL=redis://localhost:6379
JWT_SECRET=use-a-random-secret-with-at-least-32-characters
OPENROUTER_API_KEY=your-openrouter-key
ALLOWED_MODELS=openai/gpt-4o-mini
CORS_ORIGINS=http://localhost:5173
APP_URL=http://localhost:5173
```

MongoDB transactions are required for message and account mutations, so use a replica set rather than a standalone MongoDB process.

**2. Start the API**

```bash
npm run dev
```

The API listens on `http://localhost:3000`.

**3. Start the client**

In a second terminal:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`. The client defaults to `http://localhost:3000`; set `VITE_API_URL` in `client/.env` when the API is elsewhere.

Open `http://localhost:5173` in a browser.

## Run with Docker

Docker Compose starts MongoDB as replica set `rs0`, Redis with persistence, the API as a non-root Node user, and the client behind Nginx:

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| API | `http://localhost:3000` |
| API health | `http://localhost:3000/health` |
| API readiness | `http://localhost:3000/ready` |
| Client health | `http://localhost:5173/healthz` |

Create the root `.env` before starting Compose. Because the API container runs with `NODE_ENV=production`, configure `SMTP_HOST`, `SMTP_FROM`, a non-placeholder `JWT_SECRET`, a real `OPENROUTER_API_KEY`, and the deployed `APP_URL` and `CORS_ORIGINS`. The default localhost values are intended for local development only.

To try the stack on a laptop without SMTP credentials or production secrets, add the development overlay, which relaxes only those production checks:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

In that mode `forgot-password` responses include a `previewUrl` so the reset flow can be completed locally. The overlay is never applied automatically, so a plain `docker compose up` still fails fast on missing production configuration.

The Nginx proxy maps same-origin `/api/*` requests to the API and disables buffering for SSE. The API port is published on `127.0.0.1` only so traffic reaches the app through the trusted proxy; remove that mapping entirely when a reverse proxy or load balancer fronts the stack. Do not put credentials or provider keys in the client build arguments.

## Deploy

Orbit runs as three independent pieces, so each can be hosted where it fits best:

| Piece | Requirement | Notes |
| --- | --- | --- |
| API | Any container or Node host | Build the root `Dockerfile`, start with `node index.js`, and health-check `GET /ready`. |
| Database | MongoDB replica set | Transactions are required. MongoDB Atlas free tier qualifies. |
| Cache | Redis 7 | Any hosted Redis, including TLS-only endpoints. |
| Client | Static host | Build `client/` with `VITE_API_URL` pointing at the public API origin. |

Production environment variables:

```dotenv
NODE_ENV=production
PORT=3000
MONGO_URL=mongodb+srv://user:password@cluster.mongodb.net/orbit-ai?retryWrites=true&w=majority
REDIS_URL=rediss://default:password@host:port
JWT_SECRET=<random string of 32+ characters>
OPENROUTER_API_KEY=sk-or-...
CORS_ORIGINS=https://your-client-origin.example
APP_URL=https://your-client-origin.example
ALLOWED_MODELS=openai/gpt-4o-mini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=Orbit AI <you@gmail.com>
```

Deployment rules the app enforces at startup:

- `SMTP_HOST`, a non-placeholder `JWT_SECRET`, and a non-placeholder `OPENROUTER_API_KEY` are mandatory in production.
- `CORS_ORIGINS` must not contain `localhost`, so set the real client origin.
- Cookies become `Secure` and `SameSite=Strict` in production, so the client must be served over HTTPS from the same site, or the browser will drop the session cookie.
- The app trusts exactly one proxy hop in production (`trust proxy = 1`), so rate limiting sees real client IPs when a single proxy or load balancer fronts the API. Keep it that way; trusting more hops lets clients spoof `X-Forwarded-For`.
- Never place secrets in `VITE_*` build arguments; they are compiled into the public client bundle.

## Configuration

All supported variables and defaults live in [`.env.example`](.env.example). The most useful tuning points are:

| Variable | Purpose |
| --- | --- |
| `ALLOWED_MODELS` | Comma-separated server-side model allowlist. Unsupported IDs are rejected. |
| `AI_REQUEST_TIMEOUT_MS` | Timeout for non-streaming provider calls. |
| `AI_STREAM_FIRST_BYTE_TIMEOUT_MS` | Maximum wait for the first streamed token. |
| `AI_STREAM_IDLE_TIMEOUT_MS` | Maximum idle time between streamed chunks. |
| `AI_MAX_RETRIES` | Retry count for transient provider failures. |
| `AI_MAX_OUTPUT_TOKENS` | Maximum output size requested from the provider. |
| `AI_CONTEXT_CHAR_LIMIT` | Character budget for assembled conversation context. |
| `AI_SUMMARY_CHAR_LIMIT` | Maximum stored summary length. |
| `TOKEN_LIMIT` | Per-user token quota in the current Redis window. |
| `TOKEN_WINDOW_SECONDS` | Length of the token quota window. |
| `AUTH_RATE_LIMIT` | Authenticated request limit per window. |
| `AUTH_RATE_WINDOW_SECONDS` | Authenticated rate-limit window length. |
| `UNAUTH_RATE_LIMIT` | Public/authentication request limit per window. |
| `RATE_LIMIT_FAIL_OPEN` | Whether a Redis rate-limit outage may allow requests; keep `false` in production. |
| `SUMMARY_LOCK_TTL_SECONDS` | TTL for the Redis summary-concurrency lock. |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | Lifetime of a one-time password reset link. |
| `APP_URL` | Public frontend origin used to build reset links. |
| `SMTP_*` | SMTP host, port, security mode, credentials, and sender. Run `npm run mail:check` to verify. |

The client uses `VITE_API_URL` to locate the API. Its default is `http://localhost:3000`; the Docker build defaults to `/api` for same-origin proxying.

## API overview

All protected routes use the JWT cookie. Chat and message queries are always scoped to the authenticated user.

| Area | Method and endpoint | Purpose |
| --- | --- | --- |
| Auth | `POST /user/signup` | Create an account and set the session cookie. |
| Auth | `POST /user/login` | Authenticate and set the session cookie. |
| Auth | `POST /user/logout` | Clear the cookie and revoke the token in Redis. |
| Auth | `POST /user/forgot-password` | Request a generic password-reset response. |
| Auth | `POST /user/reset-password` | Consume a one-time token and invalidate old sessions. |
| Auth | `GET /user/profile` | Return the current user profile and usage. |
| Auth | `DELETE /user/delete` | Delete the account and related data transactionally. |
| Chats | `GET /chat/getRecentChat` | List the user’s recent conversations. |
| Chats | `GET /chat/:chatId` | Read one owned conversation. |
| Chats | `POST /chat/createChat` | Create a conversation with an allowlisted model. |
| Chats | `PATCH /chat/:chatId` | Rename a conversation. |
| Chats | `POST /chat/:chatId/pin` | Pin or unpin a conversation. |
| Chats | `DELETE /chat/:chatId` | Delete a conversation and its messages transactionally. |
| Messages | `POST /msg` | Create a new conversation and send a non-streaming message. |
| Messages | `POST /msg/:chatId` | Send a non-streaming message to an owned conversation. |
| Messages | `GET /msg/:chatId` | List messages for an owned conversation. |
| Stream | `POST /msg/stream` | Stream a first message and create its conversation. |
| Stream | `POST /msg/:chatId/stream` | Stream a message to an owned conversation. |

Streaming endpoints return `text/event-stream` events such as `token`, `done`, and `error`. Send `x-idempotency-key` with a stable 8–128 character key when a request may be retried.

## Password recovery

- `POST /user/forgot-password` always returns `202` with the same message for known and unknown addresses.
- The raw reset token is never stored; only its SHA-256 hash and expiry are persisted.
- Reset links use a URL fragment so the token is not sent to the frontend server or access logs.
- Reset success increments the user session version, invalidating existing JWTs, and clears the current cookie.
- In non-production environments without SMTP, a valid development-only preview link is returned to make local testing possible.
- With SMTP configured, non-production responses report `emailSent`; when delivery fails they also return the preview link so local testing keeps working.
- Production requires SMTP configuration and never returns the preview link.

### Sending real email (Gmail example)

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM=Orbit AI <you@gmail.com>
APP_URL=https://your-deployed-origin.example
```

Gmail does not accept account passwords: enable 2-Step Verification, create an App Password at <https://myaccount.google.com/apppasswords>, and use that 16-character value as `SMTP_PASSWORD`. Port 587 is required so STARTTLS can upgrade the connection before credentials are sent; setting `SMTP_HOST` without credentials is rejected at startup.

Verify the configuration before testing the UI:

```bash
npm run mail:check
```

The command reports `smtp.verified` on success and otherwise prints the SMTP error code with a targeted hint, such as `EAUTH` for rejected Gmail credentials or `ETIMEDOUT` for a blocked outbound port. Restart the API after changing `.env` so the new transport is loaded.

`APP_URL` must be reachable from the recipient's browser. A `localhost` link only opens on the machine that ran the app, so use a tunnel or deployed origin for anyone else. Gmail also enforces per-account sending limits, so repeated reset requests in a short window can be delayed or refused.

## Reliability and security

The project treats the AI provider and supporting infrastructure as fallible systems:

- **Scoped access:** every chat and message lookup includes the authenticated user ID.
- **Cookie security:** JWTs are HttpOnly, `Secure` in production, and `SameSite=Strict` in production.
- **Origin control:** CORS uses an explicit comma-separated allowlist.
- **Request protection:** Helmet, a 1 MB JSON limit, request IDs, structured metadata-only logs, and server-side validation are enabled.
- **Quota safety:** Redis reservations are atomic, reconciled with actual provider usage, and released on failure.
- **Abortable work:** streaming and non-streaming provider calls share cancellation and timeout handling.
- **Idempotency:** completed retries replay persisted messages rather than invoking the provider twice.
- **Concurrency safety:** short-lived Redis locks prevent duplicate summary jobs.
- **Data integrity:** paired messages and deletions use MongoDB transactions; the deployment must provide a replica set.
- **Graceful lifecycle:** the API waits for MongoDB and Redis during startup and closes connections during shutdown.
- **Dependency visibility:** `/health` reports process liveness; `/ready` reports MongoDB and Redis readiness.

## Testing and quality

Run the backend tests, syntax check, and dependency audit:

```bash
npm test
npm run check
npm audit --audit-level=high
```

The current suite contains 37 tests covering authentication cookies, password recovery, session invalidation, one-time reset tokens, credential parity, ownership isolation, idempotent retries, transaction rollback, streaming persistence, provider error-chunk rejection, usage fallback when the provider omits token counts, failure cleanup, provider timeout/cancellation behavior, token-limit concurrency, context bounding, and summary-lock races.

Build the production frontend:

```bash
cd client
npm run build
```

The GitHub Actions workflow runs backend audit, tests, syntax checks, and the frontend production build on Node.js 22.

To smoke-test a running stack, check `http://localhost:3000/health`, `http://localhost:3000/ready`, and `http://localhost:5173/healthz`, then send one message through the Nginx proxy and confirm that `event: token` frames arrive before `event: done` with the persisted message IDs.

## Project structure

```text
.
├── client/
│   ├── src/
│   │   ├── App.jsx          # Auth, conversation UI, streaming client, and retry state
│   │   ├── api.js           # JSON requests and SSE reader
│   │   └── styles.css       # Responsive Orbit workspace styling
│   ├── public/              # Brand assets
│   └── package.json
├── config/
│   ├── controllers/         # User, chat, and message request handlers
│   ├── database.js          # MongoDB replica-set connection
│   ├── env.js               # Zod-validated environment configuration
│   ├── openRouter.js        # OpenRouter client
│   └── redis.js             # Redis client
├── middlewares/             # Auth, limits, quotas, request context, errors
├── model/                   # User, chat, and message schemas
├── routes/                  # Express route definitions
├── service/                 # Provider and conversation-summary services
├── test/                    # Unit, HTTP, and integration tests
├── utils/                   # Context, token accounting, safe logging, and Redis operations
├── validators/              # Zod request schemas
├── scripts/                 # Backend syntax validation and SMTP diagnostics
├── docs/assets/             # README visuals and browser capture
├── docker-compose.yml
├── docker-compose.dev.yml   # Optional local overlay that relaxes production checks
├── Dockerfile
└── package.json
```
