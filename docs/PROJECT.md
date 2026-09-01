# Striv — Project Documentation

> Training intelligence platform for serious athletes. Track workouts, discover progress, understand what your training data is telling you — through precision analytics and AI.

---

## 1. Vision & Goals

### What is Striv?
Striv is a personal training analytics platform that turns raw workout data into actionable intelligence. Unlike generic trackers that count reps, Striv interprets training patterns: progress, plateau, regression, volume shifts, consistency drift — and explains them in plain language via a deterministic pattern engine + LLM (Groq) interpretation layer.

### Goals
1. **Replace memory and spreadsheets** as the primary workout log.
2. **Detect training patterns** (progress / plateau / regression) automatically from real data, not from user-claimed notes.
3. **Generate personalized insights** via AI that respect hard numbers (no hallucinated PRs, no invented percentages).
4. **Make analytics accessible** — show a trainee whether they are trending up, holding steady, or drifting, in 5 seconds.
5. **Stay free to operate** — lean stack, free-tier LLM (Groq openai/gpt-oss-120b, 1000 RPD), self-hostable.

### Non-Goals
- Social feed / community features.
- Marketplace or coach-client billing.
- Wearable / HealthKit auto-import (out of scope for v1).
- Medical or injury advice.

---

## 2. Personas

| Persona | Need | Striv Surface |
|---|---|---|
| **Lifter A (intermediate)** | Knows if squat is going up or stuck | Progress page, Records, Insights |
| **Beginner B** | Needs structure + baseline goals | Onboarding (6-step), Goals |
| **Returning C** | Wants to log quickly during workout | Active Workout screen, rest timer |
| **Analyst D** | Wants trends and consistency view | Dashboard, Intelligence Insights |

---

## 3. Architecture

### Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, custom design tokens (`globals.css`).
- **Backend**: Laravel 11, SQLite (dev) / PostgreSQL-ready, Sanctum token auth, Eloquent ORM.
- **AI**: Groq `openai/gpt-oss-120b` via Laravel `Http` client (OpenAI-compatible). Free tier 1000 RPD.
- **Design source**: Figma file `WaQf6MAAjXlCrL4mQBdyI2` (10 frames).

### Repo layout
```
Striv/
├── frontend/                Next.js 14 app (App Router)
│   ├── app/                 Route-level pages (page.tsx files)
│   ├── components/          Shared UI (AppLayout, etc.)
│   ├── lib/                 api client, auth helpers
│   └── types/               Shared TS types
├── app/                     Laravel (root)
│   ├── Http/Controllers/    API controllers
│   ├── Models/              Eloquent models
│   └── Services/            Domain services (Analytics, Patterns, Records, AI)
├── database/
│   ├── migrations/          Schema evolution
│   └── seeders/             ExerciseSeeder (128 exercises)
├── routes/api.php           v1 API surface
├── config/                  Laravel config
└── docs/                    Project docs (this file + Figma status)
```

### Data flow
```
Browser (Next.js)
  ↓ JSON over fetch (Bearer token)
Laravel API (Sanctum)
  ↓ Eloquent
SQLite (dev) / Postgres (prod)
  ↕ HTTP (Groq)
LLM (openai/gpt-oss-120b)
```

### API surface (v1)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register` | Email + password signup; returns token + needs_onboarding |
| POST | `/auth/login` | Login; returns user + profile + token |
| GET  | `/auth/google/redirect` | OAuth redirect |
| GET  | `/auth/google/callback` | OAuth callback → token → redirect `/onboarding` or `/dashboard` |
| GET  | `/auth/user` | Current user + profile |
| POST | `/auth/logout` | Revoke token |
| GET/POST/PUT/DELETE | `/workout-sessions[/{id}]` | CRUD workout sessions |
| POST | `/workout-sessions/{id}/finish` | Finalize session, run PR detection, dispatch AI job |
| GET/POST/DELETE | `/workout-sessions/{id}/exercises[/{id}]` | Exercises within a session |
| POST/PUT/DELETE | `.../exercises/{id}/sets[/{id}]` | Sets within an exercise |
| GET  | `/exercises?search=&muscle=&equipment=&page=` | Exercise library |
| GET  | `/exercises/{slug}` | Single exercise detail |
| GET  | `/analytics/dashboard` | Overview KPIs + strength trend + PR list + weekly volume |
| GET  | `/analytics/progress?days=N` | Time-series: volume by day/week, frequency, e1rm trend, consistency |
| GET  | `/analytics/exercises/{slug}` | Per-exercise: sessions count, total volume, best, recent e1rm |
| GET  | `/records?exercise=&page=` | Personal records (weight / 1RM / volume) |
| GET  | `/records/{slug}` | All PRs for one exercise |
| GET  | `/insights` | Persisted AI insights + live deterministic patterns |
| POST | `/insights/generate` | Manually trigger AI interpretation pass |
| GET/POST/PUT/DELETE | `/goals[/{id}]` | Goal CRUD |
| GET  | `/goals/{id}/progress` | Current value + percentage |
| GET/PUT | `/profile` | User profile + training profile |

### Domain services
- `AnalyticsService` — deterministic: Epley 1RM, volume by day/week, frequency, consistency score, dashboard overview, strength trend across big lifts.
- `StrengthService` — Epley formula helper, best 1RM per session for an exercise.
- `PersonalRecordService` — PR detection on session finish (weight, 1RM, volume). Idempotent — never lowers an existing PR.
- `PatternDetectionService` — progress / plateau / regression / volume_change / consistency / milestone detectors. Linear regression on e1rm points.
- `AIInsightService` + `GroqProvider` + `InsightContextBuilder` + `GenerateInsight` job — LLM interpretasi with deterministic fallback if Groq unavailable.

---

## 4. User Flows

### 4.1 New user — email signup
1. `/` (landing) → click **Start Tracking**
2. `/register` → fill name/email/password OR click **Sign up with Google**
3. **Email path**: POST `/auth/register` → backend creates user + empty profile → returns `{token, user, needs_onboarding:true}`
4. Frontend stores token + user in `localStorage`, redirects to `/onboarding?token=…`
5. **Onboarding** (6 steps):
   - Step 1: Personal Info (name read-only, age, location)
   - Step 2: Body Metrics (weight kg, height cm)
   - Step 3: Target Weight (kg)
   - Step 4: Primary Goal (Build Muscle / Get Stronger / Conditioning)
   - Step 5: Experience (Beginner/Intermediate/Advanced) + Training Frequency (1-2 / 3-4 / 5+ days)
   - Step 6: Baseline Goals (one or many — exercise + target load + target reps)
6. Submit → PUT `/profile` with `complete_onboarding:true` → POST `/goals` per baseline entry → redirect `/dashboard`
7. Dashboard guard: if profile.onboarding_completed_at is null → redirect `/onboarding` (catches users who navigated away mid-onboarding)

### 4.2 New user — Google OAuth
1. `/login` or `/register` → click **Sign in/up with Google**
2. Browser → Google → callback `/auth/google/callback`
3. Backend: find or create user → ensure profile exists
4. If profile.onboarding_completed_at is null → redirect `/onboarding?token={plainTextToken}`
5. Otherwise → redirect `/dashboard?token=…`
6. Frontend `auth.captureTokenFromUrl()` extracts `?token=…`, persists it, fetches `/auth/user` to hydrate localStorage
7. Same onboarding flow from step 5 above

### 4.3 Returning user — login
1. `/login` → email + password
2. POST `/auth/login` → backend returns user with profile
3. Frontend: if `profile.onboarding_completed_at` is null → `/onboarding`; else `/dashboard`

### 4.4 Active workout session
1. `/workout` (Lobby) → click **Start Empty Workout**
2. POST `/workout-sessions` with `started_at = now`
3. Store `sessionStorage.activeSessionId = sessionId`, redirect `/workout/active`
4. Active Workout page loads `GET /workout-sessions/{id}/exercises`
5. Add Exercise → opens modal → search `/exercises?search=…` → POST `/workout-sessions/{id}/exercises`
6. Add Set → POST `…/exercises/{id}/sets` (empty values allowed)
7. Edit set weight/reps → debounced PUT (500ms) — only sends changed values
8. Click checkbox on set → local completed flag, 90s rest timer widget
9. **Finish** → POST `/workout-sessions/{id}/finish` → backend returns `{session, summary:{exercises, sets, volume_kg}, prs_detected}`
10. Frontend clears sessionStorage, shows summary view with real metrics
11. Async: `PersonalRecordService->detectForSession` updates PRs (idempotent, never lowers)
12. Async: `GenerateInsight` job dispatched → `PatternDetectionService` + `GroqProvider` → AiInsight rows persisted

### 4.5 Browse progress
- `/dashboard` — fetched once on mount via `GET /analytics/dashboard`. Stats: workouts/sets/volume last 30d, strength trend %, recent PRs, weekly volume chart (last 8 weeks).
- `/progress?days=7/30/90/180/365` — `GET /analytics/progress?days=N`. e1RM trend chart, weekly frequency radial, weekly volume bars, 12×7 consistency heatmap.
- `/insights` — `GET /insights`. Renders deterministic patterns first (progress / plateau / regression / volume / consistency / milestone), then AI-interpreted insights with badge.
- `/records` — `GET /records?status=`. Highlights (heaviest lift, best 1RM) + grouped list.
- `/goals` — `GET /goals`. CRUD modal with exercise search. Per-card progress from `GET /goals/{id}/progress`.

### 4.6 Settings / profile
- `/profile` (read-only view of name/email + training profile fields + Edit → Settings)
- `/settings` — Sign Out, edit training profile, units/data placeholders

---

## 5. Key Design Decisions

### 5.1 Deterministic over LLM-only
PR detection, pattern detection, volume math, Epley 1RM, consistency score — **all deterministic, no LLM**. The LLM is only an *interpreter* that rewords a pre-computed pattern into natural language. This is the reason PRs and patterns can never be hallucinated or contradicted.

### 5.2 Idempotent PR detection
A PR is historical fact. `PersonalRecordService` never lowers a value, only raises. Re-running detection on the same session is a no-op. Re-running on a weaker session does not erase a stronger PR.

### 5.3 No-fake-data rule
Every metric, list item, card on every page is sourced from real DB data via real API calls. Empty states are honest ("No sessions yet." not "Estimated 1RM 245 lbs"). The Landing page and onboarding are the only screens with curated marketing copy.

### 5.4 Free AI tier
Groq `openai/gpt-oss-120b`: 1000 requests/day free, 20x headroom over our ~50/day need. OpenAI-compatible API → used via Laravel `Http` client with zero new dependencies. Falls back to deterministic patterns if Groq is unreachable.

### 5.5 No scaffolding
No `npx create-next-app` template, no Laravel Breeze, no admin boilerplate. Every line in the project was either written for Striv or pruned from a starter. The stack is what it is, not what a generator gave us.

### 5.6 401 → /login everywhere
Every API call site in the frontend checks `err.status === 401` and redirects. There is no "session expired" modal — just a clean bounce to the login page.

### 5.7 Onboarding before dashboard
Dashboard guards on `profile.onboarding_completed_at`. New users cannot skip onboarding. The onboarding is the source of all personalization data (age, weight, height, target, experience, frequency, baseline goals) that the analytics and AI rely on.

### 5.8 LocalStorage + sessionStorage split
- `localStorage.token`, `localStorage.user` — persistent across tabs/sessions.
- `sessionStorage.activeSessionId` — only for the current browser tab's active workout, cleared on finish.

---

## 6. Data Model

### Core tables
- `users` — id, name, email, password, timestamps
- `user_profiles` — user_id, age, location, weight_kg, height_cm, target_weight_kg, experience_level, primary_goal, training_frequency, preferences, onboarding_completed_at
- `exercises` — 128 rows seeded (Bench Press, Squat, Deadlift, …). equipment, category, slug.
- `exercise_muscle` — pivot: exercise_id ↔ muscle_group, with `is_primary`
- `muscle_groups` — chest, back, shoulders, biceps, triceps, legs, core, forearms
- `workout_sessions` — id, user_id, started_at, finished_at, duration_minutes, notes
- `workout_exercises` — id, workout_session_id, exercise_id, order, notes
- `workout_sets` — id, workout_exercise_id, set_number, weight_kg, reps, rpe
- `personal_records` — id, user_id, exercise_id, pr_type (weight/one_rm/volume), value, workout_session_id, achieved_at. Unique (user_id, exercise_id, pr_type)
- `goals` — id, user_id, exercise_id, target_type (weight/reps/one_rm/workouts), target_value, target_reps, deadline, status (active/completed/abandoned)
- `goal_progress` — id, goal_id, current_value, recorded_at
- `ai_insights` — id, user_id, type, title, summary, evidence (json), confidence, time_range_start, time_range_end, generated_at

### Key relations
- `User` hasOne `Profile`, hasMany `WorkoutSession`, hasMany `Goal`, hasMany `PersonalRecord`
- `WorkoutSession` hasMany `WorkoutExercise`, hasMany `PersonalRecord`
- `WorkoutExercise` belongsTo `Exercise`, hasMany `WorkoutSet`
- `Exercise` belongsToMany `MuscleGroup`, hasMany `WorkoutExercise`, hasMany `Goal`, hasMany `PersonalRecord`
- `Goal` belongsTo `User`, belongsTo `Exercise`, hasMany `GoalProgress`

---

## 7. Analytics & AI Specifics

### 7.1 Epley 1RM
```
1RM_est = weight × (1 + reps / 30)   when 1 ≤ reps ≤ 12
1RM_est = null                        otherwise (unreliable >12 reps)
```

### 7.2 Volume
`volume = Σ (weight_kg × reps)` over a session, week, day, or exercise. Sets with null weight or null reps are skipped.

### 7.3 Consistency
```
adherence_pct = min(100, avg_sessions_per_week / target_days × 100)
target_days = profile.training_frequency
window = last 4 weeks
```

### 7.4 Pattern detection gates
| Pattern | Sessions | Span | Rule |
|---|---|---|---|
| Progress | ≥4 | ≥3 weeks | e1RM slope > 0 AND relative change ≥ +5% |
| Plateau | ≥6 | ≥4 weeks | \|relative change\| < 2% OR slope ≈ 0 with R² ≥ 0.4 |
| Regression | ≥4 | ≥3 weeks | e1RM slope < 0 AND relative change ≤ -5% |
| Volume change | ≥3 non-zero each | last 8w vs prev 8w | Total change ≥ ±20% |
| Consistency | profile set + ≥2 each | last 4w vs prev 4w | Adherence delta ≥ ±15pp |
| Milestone | any | — | total finished sessions hits 10 / 25 / 50 / 100 |

### 7.5 Confidence methodology
`confidence = base + per_extra_session + r²_bonus` clamped to [0, 0.95]. Facts (milestones) at 0.95. Empty data → detector returns nothing.

### 7.6 AI interpretation (Groq)
System prompt: "You are Striv, a training intelligence system. You receive deterministic, pre-computed training patterns with evidence. Your job is ONLY to interpret and explain them in natural language. Rules: 1) Never invent numbers not present in the input. 2) Never make medical claims or prescribe training programs. 3) Keep summaries concise (max 2 sentences). 4) Output valid JSON only, matching the requested schema."

If Groq fails: deterministic pattern is persisted as-is with `evidence._source = "deterministic"`. AI failure never blocks a workout finish.

---

## 8. Build & Run

### Local dev
```bash
# Backend
composer install
cp .env.example .env       # already done
php artisan key:generate
php artisan migrate --seed # seeders: ExerciseSeeder (128)
php artisan serve          # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:3000
```

### Database
SQLite by default at `database/database.sqlite`. Schema auto-migrated on `migrate`. Switching to Postgres: change `DB_CONNECTION=pgsql` in `.env` and re-migrate.

### Seeding exercises
```bash
php artisan db:seed --class=ExerciseSeeder
```
Idempotent: uses `firstOrCreate` on slug + `syncWithoutDetaching` for muscle pivot.

### Reset DB
```bash
php artisan migrate:fresh --seed
```

### Build frontend
```bash
cd frontend && npm run build
```
17 static pages generated. All routes prerender statically except `/exercises/[slug]`.

---

## 9. Testing & Verification

### Backend tinker smoke (per service)
- `AnalyticsService->dashboardOverview($user)` returns array, no exception
- `PersonalRecordService->detectForSession` on synthetic sessions: 6 PRs created, idempotent on re-run, never lowered on weaker session
- `PatternDetectionService->detect` on synthetic data: progress/plateau/volume/consistency/milestone all detected
- `AIInsightService->generateAndPersist` on real user: creates insights; falls back to deterministic if Groq unreachable

### Frontend build
```bash
cd frontend && npm run build
```
All 17 routes static, no type errors. Lint warnings on hook deps (cosmetic) and layout font (pre-existing).

### E2E flow to verify manually
1. Register new email user → goes to `/onboarding`
2. Complete 6 steps with 2+ baseline goals
3. Lands on `/dashboard` with real analytics (zeros on first run)
4. Go to `/workout` → Start Empty Workout → Add Exercise (Bench Press) → Add 3 sets with weight/reps
5. Finish → see summary view with real exercise/sets/volume
6. Go to `/progress` → see real chart points from the session
7. Go to `/insights` → see detected patterns (volume_change at minimum, plus progress if 4+ sessions)
8. Go to `/records` → see PRs created by finish
9. Go to `/goals` → see onboarding baseline goals, edit/delete

---

## 10. Roadmap (next)

### v1.0 — Done
- Landing + auth (email + Google)
- Onboarding (6-step, multi-baseline)
- Dashboard / Progress / Insights / Records / Goals / History / Active Workout
- PR detection, pattern detection, AI interpretation
- Profile + Settings

### v1.1 — Polish
- Real progress bar per goal card (currently 0% static)
- Visual QA pass for responsive behavior
- Empty-state copy review
- Animation polish (motion-design pass)
- Mobile-bottom nav fix
- Settings: implement export data + delete account
- Settings: implement kg/lbs unit toggle with backend conversion

### v1.2 — Intelligence depth
- Plateau coaching: which lift to vary (intensity / volume / frequency)
- RPE-aware intensity analysis
- Per-muscle-group volume distribution chart
- Auto-detect if a session deviates >2σ from recent weeks

### v2.0 — Beyond v1
- Routines (programmed workout templates) — currently no backend model
- Apple Health / Health Connect import
- Apple Watch / Wear OS companion
- Social: friends can see your PRs (opt-in)
- Coach view: read-only analytics for a client

---

## 11. Known Issues & Limitations

- `goals/{id}/progress` returns `current_value` and `progress_percentage` but the goal card on `/goals` does not yet fetch & render this — display is hardcoded 0%. (Wired backend, frontend display pending.)
- `target_weight_kg` and other profile fields are stored but not used by analytics yet — `AnalyticsService` does not adjust recommendations based on bodyweight target.
- `Workout` page Recent Sessions card is read-only; click-through to session detail is not implemented (the `/workouts/[id]` route does not exist).
- `Insights` page POST `/insights/generate` exists but is not exposed in the UI.
- Search input on `/exercises` uses substring on `name`; fuzzy/synonym search not implemented.
- Mobile bottom nav shows only 5 items — `Goals`, `Records`, `History` are sidebar-only on mobile.
- Figma design system: some component classes are duplicates (e.g. `font-metric-sm text-metric-sm`) — not a bug, just verbose.

---

## 12. License & credits

Self-project. Stack:
- Next.js 14, Tailwind CSS
- Laravel 11
- Groq `openai/gpt-oss-120b` (free tier, OpenAI-compatible)
- Figma file `WaQf6MAAjXlCrL4mQBdyI2` as design source

No proprietary third-party UI kits. No paid fonts (Inter via system fallback). No analytics tracking. No telemetry sent to third parties.
