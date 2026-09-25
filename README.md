# Striv

**Train. Track. Understand.**

AI-powered personal training intelligence platform. Striv turns raw workout data into actionable insights: progress detection, plateau alerts, volume trends, personal records, and an AI coach chat with image understanding (form checks, equipment, progress photos).

Author: Raliq Hidayat BM3

## Stack

- **Backend**: Laravel 12 (PHP 8.3), Sanctum token auth, Eloquent
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS (Material 3-inspired tokens)
- **Database**: MySQL / SQLite (dev & tests)
- **AI**: OpenAI-compatible provider chain — primary **devstack (9router)**, falling back to groq; vision uses devstack. Deterministic offline fallback when no provider is reachable.
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
.\dev.ps1 status    # show running state (incl. tunnel)
.\dev.ps1 restart   # clean restart both
.\dev.ps1 share     # everything + a public HTTPS URL to send to someone

.\start.ps1 watch   # watchdog: auto-revive any server that dies (10s poll)
```

### 4. Sharing a public link

`.\dev.ps1 share` starts the stack and opens a Cloudflare quick tunnel
(no account needed) on a random `*.trycloudflare.com` host.

How one tunnel serves both apps:

1. `frontend/next.config.js` rewrites `/api/*` to the Laravel backend, so the
   browser only ever talks to a single origin.
2. The frontend is switched to `NEXT_PUBLIC_API_URL=/api/v1` (a relative path)
   so API calls follow the public host instead of `localhost:8001`.

`share.ps1` backs up `.env.local` before switching and restores it on
`.\share.ps1 stop`, so your local setup is unaffected. Because Next reads
`NEXT_PUBLIC_*` only at boot, the frontend is restarted once after sharing
begins — `.\dev.ps1 share` does this for you.

## Security

Login is throttled on two independent axes so a bot cannot brute-force either
one account or the whole user list from a single host:

| Bucket | Limit | Window |
|---|---|---|
| per IP | 20 attempts | 1 minute |
| per IP + account | 5 attempts | 15 minutes |

Once an account's bucket is exhausted, **even the correct password is refused**
until the window passes. A successful login clears both buckets. Limits live in
`app/Services/Security/LoginThrottle.php`.

Every attempt is recorded in `login_attempts` (email, IP, outcome, user agent)
and surfaced to admins under **Admin → Security**, which highlights the two
attack shapes worth spotting: one IP hitting many accounts, and one account hit
from many IPs.

Suspension is enforced by middleware on every authenticated request
(`EnsureUserIsNotSuspended`), not only at login, so a token issued before a
suspension cannot be used afterwards.

> Requests arrive through the Next dev server / tunnel, so `bootstrap/app.php`
> trusts local proxies. Without that every request would appear to come from
> `127.0.0.1`, collapsing all users into one throttle bucket and making the
> security log useless.

## Admin area

Available at `/admin` to accounts with `is_admin = true`:

| Page | Purpose |
|---|---|
| Overview | platform stats, signup trend, top exercises |
| Users | search/filter/sort, CSV export, per-user detail |
| Security | login attempts, offending IPs, targeted accounts, locked accounts |
| Audit log | every privileged action with actor, target, metadata and IP |

Per-user actions: edit name/email, grant/revoke admin, suspend/unsuspend,
reset password (issues a one-time password, forces a change at next login),
sign out everywhere, and delete the account.

Two invariants are enforced server-side and surfaced to the UI as
`capabilities` so controls disable with a reason instead of failing on click:

- you cannot act destructively on your own account;
- you cannot remove the last active administrator.

Every privileged action is written to `admin_audit_logs`. The actor's name and
the target's email are stored as plain text alongside the ids, so deleting a
user does not erase the history of what was done to them.

## Goals

A goal measures improvement from a **frozen baseline** to a target, rather than
comparing an all-time personal best against an absolute number:

```
progress = (current − starting) / (target − starting)
```

This fixes the failure mode where a goal whose target had already been reached
showed 100% the instant it was created and never moved again. Targets at or
below your current best are rejected with a message naming that best.

For weighted goals, the optional rep count **is the standard**: "100 kg × 5"
is satisfied only by sets of at least 5 reps, so a heavy single does not count.
Changing the rep count re-baselines the goal, because it redefines what is
being measured. Reaching the target completes the goal automatically.

Progress is embedded in the list response, so a goals page makes one request
rather than one per goal. See `app/Services/Goals/GoalProgressService.php`.

## AI providers

`AI_PROVIDER` (default `devstack`) selects the primary; `AI_FALLBACK` is tried
next. Configure the 9router gateway with:

| Variable | Purpose |
|---|---|
| `DEVSTACK_BASE_URI` | your 9router gateway (default `http://localhost:20128/v1`) |
| `DEVSTACK_API_KEY` | key issued by the 9router dashboard |
| `DEVSTACK_MODEL` | an alias/combo enabled there (check `GET /v1/models`) |

Run `php artisan ai:status` to see the resolved chain and whether each link is
configured, or `php artisan ai:status --ping` to send a real request. A
provider that is selected but unconfigured fails silently and the app quietly
falls back to deterministic output, which looks like "the AI is ignoring me"
rather than a misconfiguration — this command makes that visible.

## Environment

Key variables (see `.env.example` / `.env.production` template):

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` / `AI_FALLBACK` | text LLM chain (default `devstack` → `groq`) |
| `AI_VISION_PROVIDER` | vision LLM for image messages (default `devstack`) |
| `DEVSTACK_BASE_URI` / `DEVSTACK_API_KEY` / `DEVSTACK_MODEL` | 9router gateway |
| `GROQ_API_KEY` / `GROQ_MODEL` | fallback provider |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | Google OAuth login |
| `FRONTEND_URL` | where OAuth callback redirects (default localhost:3000) |
| `CORS_ALLOWED_ORIGINS` | comma-separated allowed frontend origins |
| `CONTACT_NOTIFY_EMAIL` + SMTP vars | landing-page contact form delivery |

## Testing

```bash
php artisan test        # 104 tests / 440 assertions (sqlite :memory:)
```

Covers: login rate limiting (per-IP and per-account, including the correct
password being refused mid-attack), admin user management (guards, audit trail,
CSV export), goal progress (baseline, rep standard, auto-completion), chat
sessions, and auth flows.

## Project Layout

```
app/Http/Controllers     API controllers (auth, admin/*, goals, chat, analytics…)
app/Http/Middleware      admin gate, suspended-account gate
app/Services/Security    login throttle, audit logger, admin guards
app/Services/Goals       goal progress (single source of truth)
app/Services/AI          provider chain, chat + insight services
app/Services/Analytics   deterministic analytics (Epley 1RM, trends, patterns)
database/migrations      schema (login_attempts, admin_audit_logs, goals…)
frontend/app             Next.js App Router pages (incl. /admin)
frontend/components      AppLayout (sidebar/bottom-nav), admin/* primitives
frontend/scripts         make-icons.py (regenerates favicon + app icons)
dev.ps1 / share.ps1      dev manager + public tunnel
```

## Deploy Notes (frontend on Vercel)

The frontend is deployable to Vercel as-is. Set `NEXT_PUBLIC_API_URL` to your
public backend URL, and make sure the backend sets `CORS_ALLOWED_ORIGINS` and
`FRONTEND_URL` to the Vercel origin. Google OAuth additionally needs the public
backend callback registered in Google Cloud Console.
