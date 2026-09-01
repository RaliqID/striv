# Striv — Figma Implementation Status

Figma file: `WaQf6MAAjXlCrL4mQBdyI2` ("Untitled", Page 1)
Visual source of truth: Figma frames + `assets/` HTML exports.

Status legend:
- NOT_STARTED → IN_PROGRESS → IMPLEMENTED → CONNECTED → VISUAL_QA → COMPLETE
- CONNECTED = real API + real DB data wired (no hardcoded production values)

| Screen | Figma Node | Frontend | Backend | API | Responsive | QA |
|---|---|---|---|---|---|---|
| Landing Page | #3:289 | IMPLEMENTED | n/a | n/a | PARTIAL | NOT_STARTED |
| Sign In | #3:175 | IMPLEMENTED | COMPLETE | COMPLETE | PARTIAL | NOT_STARTED |
| Sign Up | #3:225 | IMPLEMENTED | COMPLETE | COMPLETE | PARTIAL | NOT_STARTED |
| Onboarding | (assets) | IMPLEMENTED (static) | MISSING | MISSING | PARTIAL | NOT_STARTED |
| Dashboard Overview | #3:358 | IMPLEMENTED (static data) | MISSING (no dashboard API/analytics service) | MISSING | PARTIAL | NOT_STARTED |
| Workout Routines | #3:1617 | CONNECTED (Lobby: Quick Start POST session, Recent Sessions real; no AI section — honest skip) | PARTIAL (session store exists; no routines/AI-suggest endpoints) | COMPLETE | PARTIAL | NOT_STARTED |
| Active Workout | #3:528 | IN_PROGRESS (rewrite to real API in progress) | CONNECTED (exercise/set CRUD + finish summary; e1rm PR pending) | COMPLETE | PARTIAL | NOT_STARTED |
| Training History | #3:1454 | CONNECTED (real sessions, month groups, states) | PARTIAL (index; no search/date filter API) | COMPLETE | PARTIAL | NOT_STARTED |
| Exercises Directory | #3:1992 | IMPLEMENTED | COMPLETE (search/muscle/equipment filters) | COMPLETE | PARTIAL (desktop grid responsive) | NOT_STARTED |
| Exercise Detail | assets | IMPLEMENTED (static data) | PARTIAL (no exercise analytics API) | MISSING | PARTIAL | NOT_STARTED |
| Progress Analytics | #3:664 | IMPLEMENTED (static data) | MISSING (no analytics service) | MISSING | PARTIAL | NOT_STARTED |
| Goals Management | #3:1081 | NOT_STARTED | PARTIAL (models/migrations; no endpoints) | MISSING | NOT_STARTED | NOT_STARTED |
| Personal Records | #3:1256 | IN_PROGRESS | CONNECTED (detection engine + endpoints) | COMPLETE | NOT_STARTED | NOT_STARTED |
| Intelligence Insights | #3:915 | IMPLEMENTED (static data) | MISSING (no pattern detection/AI) | MISSING | PARTIAL | NOT_STARTED |
| Settings | #3:1828 | NOT_STARTED | MISSING | MISSING | NOT_STARTED | NOT_STARTED |
| Profile | #3:2178 | NOT_STARTED | PARTIAL (profile model/migration; no endpoints) | MISSING | NOT_STARTED | NOT_STARTED |

## Audit findings (Phase 0)

### Backend (Laravel 13, sqlite, Sanctum + Socialite)
- ✅ API routing loaded (`/api/v1`), Sanctum auth + Google OAuth working
- ✅ 14 models, 18 migrations, 30 exercises + 7 muscle groups seeded
- ⚠ AuthServiceProvider unregistered (policies work via auto-discovery only)
- ⚠ No config/cors.php (wildcard default)
- ❌ No Services / Jobs / Events layers — all logic in controllers
- ❌ No analytics engine, PR detection, pattern detection, AI layer
- ❌ Workout API incomplete: cannot add exercises/sets to session from frontend
- ❌ Zero real tests; no Docker; PostController is legacy scaffolding

### Frontend (Next.js 14 App Router)
- ✅ 9 pages, design tokens in tailwind.config.ts match Figma (verified vs assets)
- ✅ AppLayout (sidebar/mobile nav), auth flow works with localStorage token
- ⚠ lib/api.ts error parser expects `{detail}` but Laravel emits `{message}` — real error messages swallowed
- ❌ Missing pages: Routines, History index, Exercises index, Goals, Records, Settings, Profile
- ❌ No data-fetching layer (raw fetch inline), no chart lib, no state mgmt
- ❌ Dashboard/Progress/Insights/Exercise detail render hardcoded numbers — violates no-fake-data rule for production

### Infra gaps
- No Docker, no CI, no tests, SQLite instead of PostgreSQL (acceptable for dev; plan migration later)

### STEP 3/4 backend results (fix-1, verified 2026-08-28)
- ExerciseSeeder: 128 exercises in DB (115 seeded, idempotent via firstOrCreate + syncWithoutDetaching)
- ExerciseController: search/muscle/equipment filters, slug show fixed, paginate(24)
- WorkoutExerciseController: full CRUD (exercises-in-session + sets), ownership authorized, cascade deletes
- finish() returns session + summary {exercises, sets, volume_kg}
- User::workoutSessions() relation added (was missing)
- Routes: 20 → 26 v1 endpoints

### STEP 5 in progress (fix-1 resumed)
- AnalyticsService: Epley 1RM (≤12 reps), volume by day/week, frequency, consistency (profile-based), dashboard overview, strength trend across big lifts
- Endpoints: GET /analytics/dashboard, /analytics/progress, /analytics/exercises/{slug}

- STEP 0 — Audit (this doc) ✅
- STEP 1 — Foundation: fix api.ts error parsing, add auth guard hook, shared states (loading/empty/error), fetch wrapper, register AuthServiceProvider, publish CORS
- STEP 2 — Auth: already functional; add protected-route guard polish + visual QA vs Figma
- STEP 3 — Exercise system: expand seed (30 → 100+), Exercises Directory page (Figma #3:1992), fix /exercises index route
- STEP 4 — Workout engine: backend endpoints for exercises-in-session + sets; Active Workout wired to real API; Workout Routines page (#3:1617)
- STEP 5 — Analytics: AnalyticsService (volume/1RM Epley/frequency/consistency), dashboard API, connect Dashboard (#3:358) + Progress (#3:664) + Exercise detail to real data
- STEP 6 — Intelligence: PR engine (idempotent detection), pattern detection (progress/plateau/regression), AI provider abstraction + context builder + validated insights, connect Insights (#3:915)
- STEP 7 — Goals/Records/History: endpoints + pages (#3:1081, #3:1256, #3:1454)
- STEP 8 — Polish: Settings/Profile pages (#3:1828, #3:2178), onboarding API, states, responsive, a11y
- STEP 9 — Visual QA: screen-by-screen compare localhost vs Figma, fix discrepancies
- STEP 10 — Tests: Pest for analytics/PR/pattern logic; Playwright for register→login→workout→dashboard E2E
