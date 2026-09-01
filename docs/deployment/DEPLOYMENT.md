# Striv Deployment Guide

Production stack: Docker (nginx + PHP-FPM + PostgreSQL + Redis) + Next.js container.

## Prerequisites

- Docker + Docker Compose v2
- Groq API key — https://console.groq.com (free tier: 1000 req/day)
- Google OAuth 2.0 credentials — https://console.cloud.google.com (for Google sign-in)

## 1. Configure

```bash
cp .env.production .env
```

Edit `.env`:

| Key | Value |
|---|---|
| `APP_URL` | your domain (e.g. `https://striv.app`) |
| `DB_PASSWORD` | strong Postgres password |
| `GROQ_API_KEY` | from console.groq.com |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `{APP_URL}/api/v1/auth/google/callback` |

**Important:** add the exact `GOOGLE_REDIRECT_URI` to Google Cloud Console → Credentials → Authorized redirect URIs.

## 2. Start backend stack

```powershell
.\start.ps1 up        # docker-compose up -d + migrate
# or manually:
docker-compose up -d
docker-compose exec app php artisan migrate --force
docker-compose exec app php artisan db:seed --class=ExerciseSeeder --force
```

Services:
- **nginx** — port 80, reverse proxy → PHP-FPM
- **app** — Laravel (PHP 8.3-fpm), config/route/view cached
- **db** — PostgreSQL 17, data in `pgdata` volume
- **redis** — queue/cache (run a worker, see §4)

## 3. Start frontend

```powershell
cd frontend
docker build -t striv-frontend .
docker run -d -p 3000:3000 striv-frontend
```

Frontend expects `NEXT_PUBLIC_API_URL` at build time — default `http://localhost:8000/api/v1`. For production domain, build with:

```powershell
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.striv.app/api/v1 -t striv-frontend .
```

(Presently Dockerfile uses default; add ARG/ENV passthrough when deploying to a real domain.)

Alternatively deploy frontend to **Vercel** (zero config for Next.js) and set `NEXT_PUBLIC_API_URL` env var there.

## 4. Queue worker (AI insights + weekly reviews)

Insight generation and PR detection dispatch jobs. Run a persistent worker:

```bash
docker-compose exec -d app php artisan queue:work --tries=2 --backoff=60
```

For production reliability use Supervisor or a dedicated worker service (can be added to compose later).

## 5. Verify

```bash
# API health
curl https://your-domain/api/v1/exercises       # → 200 + JSON list

# Frontend
curl https://your-domain:3000/                  # → landing page HTML

# Container status
docker-compose ps
```

## 6. Operations

| Task | Command |
|---|---|
| Logs | `docker-compose logs -f app` |
| Restart | `./start.ps1 restart` or `docker-compose restart` |
| Stop | `./start.ps1 down` |
| DB backup | `docker-compose exec db pg_dump -U postgres striv > backup.sql` |
| DB restore | `docker-compose exec -T db psql -U postgres striv < backup.sql` |
| Deploy update | `git pull && docker-compose up -d --build app` |

## 7. Scaling notes (hundreds of users)

- **Postgres** — single instance is fine for hundreds of users. Add connection pooling (pgbouncer) at thousands.
- **PHP-FPM** — scale `app` replicas behind nginx upstream when CPU-bound: `docker-compose up -d --scale app=3` (requires nginx `upstream` config).
- **Redis** — already in stack for queues; switch `CACHE_STORE=redis` and `QUEUE_CONNECTION=redis` in `.env` for multi-instance safety.
- **AI cost** — Groq free tier 1000 RPD ≈ 20x headroom at 50 AI calls/day. Rate is capped at max 3 insight generations per run + 7-day dedup.
- **HTTPS** — terminate at your load balancer, or add certbot container to nginx.

## Rollback

```bash
docker-compose down
git checkout <previous-tag>
docker-compose up -d --build app
docker-compose exec app php artisan migrate --force  # if schema changed
```
