# Production Deployment

## Prerequisites
- Docker & Docker Compose installed
- PostgreSQL (or use Docker)
- Node.js 20+ for frontend build

## Deploy with Docker (recommended)

1. Copy environment template:
   ```bash
   cp .env.production .env
   ```
2. Fill secrets in `.env`: `DB_PASSWORD`, `GROQ_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Build and start:
   ```bash
   docker-compose up -d
   docker-compose exec app php artisan migrate --force
   ```
4. Build frontend (separate):
   ```bash
   cd frontend
   npm install
   npm run build
   npm run start  # or use Dockerfile in frontend/
   ```

## Local Dev (quick start)

```bash
# Backend
php artisan serve --host=127.0.0.1 --port=8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Dev Scripts
- `./start.ps1 up` – start Docker stack
- `./start.ps1 down` – stop
- `./start.ps1 watch --force` – watchdog auto-restart on crash (kills stale ports first)

## Environment Variables (minimal)
| Var | Description |
|-----|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `GROQ_API_KEY` | Groq API key for AI insights |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | Must match Google Console |