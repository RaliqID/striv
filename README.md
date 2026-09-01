# Striv

**Train. Track. Understand.**

AI-powered personal training intelligence platform. Striv turns raw workout data into actionable insights: progress detection, plateau alerts, volume trends, personal records, and AI-interpreted weekly reviews.

## Stack

- **Backend**: Laravel 11 (PHP 8.3), Sanctum auth, Eloquent
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database**: PostgreSQL (production) / SQLite (dev)
- **Cache/Queue**: Redis
- **AI**: Groq `openai/gpt-oss-120b` (free tier, OpenAI-compatible) with deterministic fallback

## Quick Start (Development)

### Backend
```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed   # seeds 128 exercises
php artisan serve             # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

### Dev helper scripts
```powershell
.\dev.ps1 start     # start backend + frontend clean (kills duplicates first)
.\dev.ps1 stop      # stop all
.\dev.ps1 restart   # restart both
.\dev.ps1 status    # check ports + processes
```

## Production Deployment (Docker)

### Prerequisites
- Docker + Docker Compose
- Groq API key (free at console.groq.com)
- Google OAuth credentials (for Google sign-in)

### Steps

1. **Configure environment**
   ```bash
   cp .env.production .env
   # edit: DB_PASSWORD, GROQ_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
   ```

2. **Start the stack**
   ```bash
   ./start.ps1 up          # or: docker-compose up -d
   ```

   This starts:
   - `db` — PostgreSQL 17 (persistent volume `pgdata`)
   - `redis` — Redis 7
   - `app` — Laravel PHP-FPM (with config/route/view caches)
   - `nginx` — reverse proxy on port 80

3. **Run migrations**
   ```bash
   docker-compose exec app php artisan migrate --force
   docker-compose exec app php artisan db:seed --class=ExerciseSeeder --force
   ```

4. **Frontend**
   ```bash
   cd frontend
   docker build -t striv-frontend .
   docker run -d -p 3000:3000 striv-frontend
   ```
   Point nginx (or your reverse proxy / Vercel) at port 3000.

5. **Verify**
   ```bash
   curl http://localhost/api/v1/exercises       # 200 + JSON
   curl http://localhost:3000/                   # landing page
   ```

### Useful commands
```bash
./start.ps1 logs      # tail all container logs
./start.ps1 restart   # restart containers
./start.ps1 down      # stop everything
docker-compose exec app php artisan queue:work   # run AI/insight jobs
```

## API Overview

Base: `/api/v1` — full reference in `docs/PROJECT.md` §3.

| Area | Endpoints |
|---|---|
| Auth | register, login, logout, Google OAuth |
| Workouts | sessions CRUD, exercises-in-session, sets, finish (PR detect + AI dispatch) |
| Analytics | dashboard, progress (7D–1Y), per-exercise |
| Records | list, per-exercise (weight/1RM/volume PRs) |
| Insights | feed, generate |
| Goals | CRUD + progress % |
| Routines | CRUD + start (prefilled session) |
| Reviews | weekly list/show/generate |
| Profile | show/update (biodata + training profile) |

## Documentation

- `docs/PROJECT.md` — full project documentation (architecture, flows, data model, AI methodology)
- `docs/FIGMA_IMPLEMENTATION_STATUS.md` — screen-by-screen implementation tracker
- `docs/deployment/DEPLOYMENT.md` — detailed deployment guide

## Notes

- All analytics are deterministic (Epley 1RM, volume, consistency). The LLM only interprets pre-computed patterns — never invents numbers.
- AI failure never blocks data: workout finishes and PRs persist even when Groq is down.
