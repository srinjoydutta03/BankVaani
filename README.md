# BankVaani

Voice-first banking copilot that pairs a LiveKit agent with a Next.js 15 app and a FastAPI + MongoDB backend. Users sign up, log in, and start a secure LiveKit session where the agent can fetch balances, list transactions, and move money while keeping sensitive inputs (account selection, TPIN) on-screen only.

## Stack
- Next.js 15 (App Router, React 19) with LiveKit Components for the in-call UI and built-in auth/API routes backed by MongoDB.
- LiveKit Agent worker using LiveKit Agents SDK, Sarvam STT, ElevenLabs TTS, VAD, and noise cancellation.
- FastAPI banking API with session-based auth, scoped account/transaction endpoints, and bcrypt hashing.
- MongoDB for users, sessions, customers, accounts, and transactions.

## Repo layout
- `nextjs-frontend/` — Next.js app (landing/login/signup, call UI, LiveKit token minting, Mongo-backed auth).
- `livekit-backend/bank_api.py` — FastAPI service for users, accounts, transactions, and transfers.
- `livekit-backend/agent.py` — LiveKit Agent worker wiring STT/LLM/TTS + tool calls to the banking API.
- `livekit-backend/tools.py` — Tool functions the agent uses to call the banking API with the user’s session.
- `livekit-backend/prompt.py` — Agent/system instructions and user-facing behavior.

## Prerequisites
- Node.js 20+ and `pnpm` 9+ (per `packageManager`).
- Python 3.13+ and `uv` (`pip install uv`) or another virtualenv tool.
- MongoDB 6+ reachable at the URI you supply.
- LiveKit Cloud/Local project + API key/secret and a reachable LiveKit URL.
- Optional: Sarvam API key (STT) and ElevenLabs API key (TTS) for the agent voice.

## Environment
Create `.env.local` files from the provided examples.

`nextjs-frontend/.env.local`
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` — used to mint participant tokens in `/api/connection-details`.
- `MONGODB_URI` and optional `MONGODB_DB` (default `voicebank`) — used by Next.js auth + session routes.
- `NEXT_PUBLIC_APP_CONFIG_ENDPOINT` — optional remote app config JSON endpoint.
- `SANDBOX_ID` — optional header passed to config/token routes.

`livekit-backend/.env.local`
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` — used by the agent worker to connect to LiveKit.
- `MONGODB_URI` and optional `MONGODB_DB` — used by the FastAPI service.
- `BANK_API_BASE_URL` — where the agent should call the FastAPI (default `http://localhost:8000`).
- `BANK_API_SESSION_ID` — optional override for local testing when no participant metadata is present.
- `SARVAM_API_KEY` / `ELEVEN_API_KEY` — speech keys for STT/TTS.
- `NEXT_PUBLIC_APP_CONFIG_ENDPOINT`, `SANDBOX_ID` — kept for parity if you share env files.

## Backend setup (FastAPI + LiveKit agent)
```bash
cd livekit-backend
cp .env.example .env.local   # fill in LiveKit, Mongo, speech keys, etc.

# create and activate a venv (using uv)
uv venv
source .venv/bin/activate
uv sync   # installs from pyproject.toml/uv.lock

# start MongoDB separately, then run the banking API
uv run uvicorn bank_api:app --host 0.0.0.0 --port 8000

# (optional) seed richer mock data by uncommenting seed_sample_data in bank_api.py startup

# in another terminal with the same venv, start the LiveKit agent worker
uv run python agent.py
```
The agent expects the FastAPI service to be reachable at `BANK_API_BASE_URL` and will attach the user’s session id (from participant metadata) to every tool call.

## Frontend setup (Next.js)
```bash
cd nextjs-frontend
cp .env.example .env.local   # fill in LiveKit + Mongo values to match the backend
pnpm install
pnpm dev   # http://localhost:3000
```
Auth/signup/login and `/api/connection-details` use the same Mongo instance you configured. After logging in, start a call to generate a LiveKit token and join the room with the agent.

## Key flows & endpoints
- FastAPI (`livekit-backend/bank_api.py`): `/signup`, `/login`, `/logout`, `/me/customer`, `/me/accounts`, `/me/accounts/{id}`, `/me/accounts/{id}/transactions`, `/me/transfers` (TPIN required).
- Agent tools (`livekit-backend/tools.py`): list accounts, fetch balance, list recent transactions, initiate transfer (collects payee + TPIN via LiveKit RPC), loan options, EMI calculator.
- Next.js APIs: `/api/auth/*` for signup/login/logout with bcrypt hashing; `/api/connection-details` mints short-lived LiveKit tokens scoped to the user and room.

## Useful commands
- Frontend: `pnpm lint`, `pnpm build`, `pnpm start` for production preview.
- Backend: `uv run uvicorn bank_api:app --host 0.0.0.0 --port 8000` and `uv run python agent.py`.

## Running the whole stack locally
1) Start MongoDB and ensure `MONGODB_URI` is reachable.  
2) Run the FastAPI server on port 8000.  
3) Run the LiveKit agent worker (same env as the FastAPI service).  
4) Start the Next.js dev server on port 3000, sign up/login, and place a call.  

With valid LiveKit + speech keys and a reachable MongoDB, you get a secure voice/chat banking session end-to-end.

## Demo video

Available at YouTube: https://www.youtube.com/watch?v=UABRrMogK2Q
