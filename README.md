# Striv

**Train. Track. Understand.**

AI-powered personal training intelligence platform. Striv turns raw workout data into actionable insights: progress detection, plateau alerts, volume trends, personal records, and an AI coach chat with image understanding (form checks, equipment, progress photos).

Author: Raliq Hidayat BM3

## Stack

- **Backend**: Laravel 12 (PHP 8.3), Sanctum token auth, Eloquent
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS (Material 3-inspired tokens)
- **Database**: MySQL / SQLite (dev & tests)
- **AI**: OpenAI-compatible provider chain — text: xkiro `minimax/minimax-m3` (primary) → groq fallback; images: b.ai `glm-5.3-flash` (vision). Deterministic offline fallback when no provider is reachable.
- **Mail**: Gmail SMTP (app password) for landing-page contact form

## Requirements

- PHP 8.3+ with `pdo_mysql`/`pdo_sqlite`, Composer
- Node.js 18+ (20+ recommended), npm
- MySQL 8 (or use SQLite for zero-setup dev)

## How to Run (Development)

The dev servers listen on **backend port 8001** and **frontend port 3000**.

### 1. Backend

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Create the dev database (MySQL) or switch `DB_CONNECTION=sqlite` in `.env` for zero-setup:

```bash
php artisan migrate --seed   # seeds 128 exercises
php artisan storage:link      # chat image uploads
php artisan serve --host=127.0.0.1 --port=8001 --no-reload
```

> On Windows, set `PHP_CLI_SERVER_WORKERS=8` before `artisan serve` (parallel
> API requests crash a lone single worker; `--no-reload` is required for the
> workers env var to take effect). The provided scripts do this for you.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

The API base URL falls back to `http://localhost:8001/api/v1` in dev — no
extra config needed. For a deployed frontend, set `NEXT_PUBLIC_API_URL`.

### 3. One-command helpers (Windows)

```powershell
.\dev.ps1 start     # backend (workers=8) + frontend, health-checked
.\dev.ps1 status    # show running state
.\dev.ps1 restart   # clean restart both

.\start.ps1 watch   # watchdog: auto-revive any server that dies (10s poll)
```

## Environment

Key variables (see `.env.example` / `.env.production` template):

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` / `AI_FALLBACK` | text LLM chain (default `xkiro` → `groq`) |
| `AI_VISION_PROVIDER` | vision LLM for image messages (default `bai`) |
| `XKIRO_API_KEY` / `XKIRO_MODEL` | primary text provider |
| `BAI_API_KEY` / `BAI_MODEL` | vision provider (image chat) |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Google OAuth login |
| `FRONTEND_URL` | where OAuth callback redirects (default localhost:3000) |
| `CORS_ALLOWED_ORIGINS` | comma-separated allowed frontend origins |
| `CONTACT_NOTIFY_EMAIL` + SMTP vars | landing-page contact form delivery |

## Testing

```bash
php artisan test        # 39 tests / 160 assertions (sqlite :memory:)
```

Covers: ChatService sessions (title resolution, isolation, cascade delete),
chat API (validation, rate limit, image storage), chat sessions CRUD, and
auth flows (register/login/token).

## Project Layout

```
app/Http/Controllers     API controllers (auth, chat, sessions, analytics…)
app/Services/AI         provider chain, chat + insight services
app/Services/Analytics   deterministic analytics (Epley 1RM, trends, patterns)
database/migrations     schema (chat_sessions cascade delete, etc.)
frontend/app             Next.js App Router pages
frontend/components      AppLayout (sidebar/bottom-nav) etc.
dev.ps1 / start.ps1      dev manager + watchdog
```

## Deploy Notes (frontend on Vercel)

The frontend is deployable to Vercel as-is. Set `NEXT_PUBLIC_API_URL` to your
public backend URL, and make sure the backend sets `CORS_ALLOWED_ORIGINS` and
`FRONTEND_URL` to the Vercel origin. Google OAuth additionally needs the public
backend callback registered in Google Cloud Console.
