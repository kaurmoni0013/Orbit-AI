# Orbit Arena

Orbit Arena is a full-stack AI conversation workspace built with React, Express, MongoDB, Redis, and OpenRouter.

## Features

- Cookie-based authentication with JWT
- Persistent chats and messages
- OpenRouter model integration
- Redis request rate limiting and token quotas
- Conversation context and summarization
- Security headers, CORS, health/readiness checks, and graceful shutdown
- Responsive gaming/sports-inspired React interface

## Local setup

1. Copy `.env.example` to `.env` and fill in MongoDB, Redis, JWT, and OpenRouter values.
   Set `ALLOWED_MODELS` to the comma-separated OpenRouter model IDs that users may select.
2. Start the backend:

   ```powershell
   npm install
   npm run dev
   ```

3. Start the frontend in another terminal:

   ```powershell
   cd client
   npm install
   copy .env.example .env
   npm run dev
   ```

4. Open `http://localhost:5173`.

Run backend tests with `npm test` and build the frontend with `cd client; npm run build`.

## Docker

```powershell
docker compose up --build
```

The API is available at `http://localhost:3000`; the frontend is available at `http://localhost:5173`.

For Docker, set `OPENROUTER_API_KEY` and a random `JWT_SECRET` in the root `.env`.

## Health

- `GET /health` — process liveness
- `GET /ready` — MongoDB and Redis readiness

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /user/signup`, `POST /user/login`, `POST /user/logout`, `GET /user/profile` |
| Chats | `POST /chat/createChat`, `GET /chat/getRecentChat`, `GET /chat/:chatId`, `DELETE /chat/:chatId` |
| Messages | `POST /msg`, `POST /msg/:chatId`, `GET /msg/:chatId` |

The browser client uses `credentials: include`; configure `CORS_ORIGINS` to match the deployed frontend origin.
