<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\WorkoutSessionController;
use App\Http\Controllers\WorkoutExerciseController;
use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\GoalController;
use App\Http\Controllers\ProgressionController;

Route::prefix('v1')->group(function () {

    /*
     * Public auth endpoints.
     *
     * Login is throttled inside the controller (two dimensions: IP and
     * IP+account) so an attacker cannot walk the user list or brute-force one
     * account. Register and the OAuth redirect are guarded here because they
     * have no credential to check against — the only useful control is a
     * request-rate ceiling.
     */
    Route::post('/auth/register', [AuthController::class, 'register'])
        ->middleware('throttle:5,60');              // 5 signups/hour per IP

    Route::post('/auth/login', [AuthController::class, 'login']);

    // OAuth entry points: capped to stop redirect-loop / enumeration abuse.
    Route::get('/auth/google/redirect', [AuthController::class, 'redirectToGoogle'])
        ->middleware('throttle:10,60');
    Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback'])
        ->middleware('throttle:10,60');

    Route::middleware(['auth:sanctum', 'not_suspended'])->group(function () {
        Route::get('/auth/user', [AuthController::class, 'user']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Workout sessions
        /*
         * Today's plan.
         *
         * The workout lobby calls this on load so the member does not have to
         * build a session themselves — the schedule and prescribed programme
         * already determine it.
         */
        Route::get('/workout/today', [\App\Http\Controllers\TodayPlanController::class, 'show']);

        Route::apiResource('workout-sessions', WorkoutSessionController::class);
        Route::post('/workout-sessions/{workout_session}/finish', [WorkoutSessionController::class, 'finish']);

        /*
         * Photo evidence for a set.
         *
         * A set cannot be completed without one, and the photo is checked
         * against the claimed exercise — so a session record reflects what the
         * member actually did rather than what they tapped.
         */
        Route::post(
            '/workout-sessions/{workout_session}/sets/{set}/photo',
            [\App\Http\Controllers\WorkoutSetPhotoController::class, 'store'],
        )->whereNumber(['workout_session', 'set']);

        Route::get(
            '/workout-sessions/{workout_session}/sets/{set}/photo',
            [\App\Http\Controllers\WorkoutSetPhotoController::class, 'show'],
        )->whereNumber(['workout_session', 'set']);

        Route::delete(
            '/workout-sessions/{workout_session}/sets/{set}/photo',
            [\App\Http\Controllers\WorkoutSetPhotoController::class, 'destroy'],
        )->whereNumber(['workout_session', 'set']);

        // Image bytes. A named route because the JSON payload links to it.
        Route::get('/photos/{photo}/file', [\App\Http\Controllers\WorkoutSetPhotoController::class, 'file'])
            ->name('workout-set-photo.file')
            ->whereNumber('photo');

        // Workout exercises + sets
        Route::get('/workout-sessions/{workout_session}/exercises', [WorkoutExerciseController::class, 'index']);
        Route::post('/workout-sessions/{workout_session}/exercises', [WorkoutExerciseController::class, 'store']);
        Route::delete('/workout-sessions/{workout_session}/exercises/{workout_exercise}', [WorkoutExerciseController::class, 'destroy']);
        Route::post('/workout-sessions/{workout_session}/exercises/{workout_exercise}/sets', [WorkoutExerciseController::class, 'storeSet']);
        Route::put('/workout-sessions/{workout_session}/exercises/{workout_exercise}/sets/{set}', [WorkoutExerciseController::class, 'updateSet']);
        Route::delete('/workout-sessions/{workout_session}/exercises/{workout_exercise}/sets/{set}', [WorkoutExerciseController::class, 'destroySet']);

        // Exercises
        Route::get('/exercises', [ExerciseController::class, 'index']);
        Route::get('/exercises/{slug}', [ExerciseController::class, 'show'])->where('slug', '[a-z0-9-]+');

        // Analytics
        Route::get('/analytics/dashboard', [\App\Http\Controllers\AnalyticsController::class, 'dashboard']);
        Route::get('/analytics/progress', [\App\Http\Controllers\AnalyticsController::class, 'progress']);
        Route::get('/analytics/exercises/{slug}', [\App\Http\Controllers\AnalyticsController::class, 'exerciseAnalytics'])->where('slug', '[a-z0-9-]+');

        // Personal records
        Route::get('/records', [\App\Http\Controllers\PersonalRecordController::class, 'index']);
        Route::get('/records/{slug}', [\App\Http\Controllers\PersonalRecordController::class, 'show'])->where('slug', '[a-z0-9-]+');

        /*
         * AI endpoints — throttled by cost, not by traffic.
         *
         * These call an external model on every request, so each one costs money
         * and takes seconds. Unlike the read endpoints, they were completely
         * unprotected: 25 consecutive calls to a normal GET returned 25× 200
         * with no 429, and nothing stopped the same from being done to these.
         *
         * The limits are per-user per-minute and chosen to sit far above real
         * use:
         *
         *   insights/generate  — 10/min. Generation is a deliberate action and
         *                        dedup already suppresses repeats within 7 days,
         *                        so a member has no reason to call it often.
         *   reviews/generate   — 5/min. One weekly review is the intended flow.
         *   chat               — 30/min. This IS the interactive path: a member
         *                        typing quickly, or a retry after a slow reply,
         *                        must not be blocked. 30 is roughly one message
         *                        every two seconds sustained.
         *
         * Deliberately NOT applied to the read endpoints. `/insights` and
         * `/chat` (GET) are polled and loaded on navigation, and a broad throttle
         * would break those pages rather than protect anything — the launcher
         * already documents that the dashboard fires several parallel calls.
         */
        Route::get('/insights', [\App\Http\Controllers\InsightController::class, 'index']);
        Route::post('/insights/generate', [\App\Http\Controllers\InsightController::class, 'generate'])
            ->middleware('throttle:10,1');

        // Goals
        // `baseline` is declared before the resource so it is not captured as
        // a goal id by the {goal} wildcard.
        Route::get('/goals/baseline', [GoalController::class, 'baseline']);
        Route::apiResource('goals', GoalController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
        Route::get('/goals/{goal}/progress', [GoalController::class, 'progress']);

        // Profile
        // `export` is declared before any wildcard-free siblings for clarity;
        // it is a distinct path so ordering is not load-bearing here.
        Route::get('/profile/export', [\App\Http\Controllers\ProfileController::class, 'export']);
        Route::get('/profile', [\App\Http\Controllers\ProfileController::class, 'show']);
        Route::put('/profile', [\App\Http\Controllers\ProfileController::class, 'update']);
        Route::delete('/profile', [\App\Http\Controllers\ProfileController::class, 'destroy']);

        // Routines (workout templates)
        Route::apiResource('routines', \App\Http\Controllers\RoutineController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
        Route::post('/routines/{routine}/start', [\App\Http\Controllers\RoutineController::class, 'start']);

        // Weekly review reports
        Route::get('/reviews/weekly', [\App\Http\Controllers\WeeklyReviewController::class, 'index']);
        Route::get('/reviews/weekly/{id}', [\App\Http\Controllers\WeeklyReviewController::class, 'show'])->whereNumber('id');
        Route::post('/reviews/weekly/generate', [\App\Http\Controllers\WeeklyReviewController::class, 'generate'])
            ->middleware('throttle:5,1');

        // AI Coach chat - sessions
        Route::get('/chat/sessions', [\App\Http\Controllers\ChatSessionController::class, 'index']);
        Route::post('/chat/sessions', [\App\Http\Controllers\ChatSessionController::class, 'store']);
        Route::get('/chat/sessions/{sessionId}', [\App\Http\Controllers\ChatSessionController::class, 'show']);
        Route::delete('/chat/sessions/{sessionId}', [\App\Http\Controllers\ChatSessionController::class, 'destroy']);

        /*
         * Split onto separate lines so the throttle can target the POST alone.
         *
         * They were previously declared on one line, which is why the AI-calling
         * POST could not be limited without also limiting the GET. The GET is a
         * page-load read (the coach screen loads history on mount) and must stay
         * unthrottled; the POST invokes the model and is the one worth capping.
         */
        Route::get('/chat', [\App\Http\Controllers\ChatController::class, 'index']);
        Route::post('/chat', [\App\Http\Controllers\ChatController::class, 'store'])
            ->middleware('throttle:30,1');
        Route::delete('/chat', [\App\Http\Controllers\ChatController::class, 'destroy']);

        /*
         * Personal trainer — member side.
         *
         * The member does not manage a trainer, they are matched with one: the
         * writes here are only the ones a member legitimately owns (re-request,
         * propose a slot, respond to one, release, rate).
         */
        Route::prefix('my-trainer')->group(function () {
            Route::get('/', [\App\Http\Controllers\MyTrainerController::class, 'show']);
            Route::post('/request', [\App\Http\Controllers\MyTrainerController::class, 'request']);
            Route::post('/schedule', [\App\Http\Controllers\MyTrainerController::class, 'proposeSchedule']);
            Route::post('/schedule/{scheduleId}/respond', [\App\Http\Controllers\MyTrainerController::class, 'respondToSchedule'])->whereNumber('scheduleId');
            Route::post('/release', [\App\Http\Controllers\MyTrainerController::class, 'release']);
            Route::post('/rate', [\App\Http\Controllers\MyTrainerController::class, 'rate']);
            Route::post('/feedback/{feedbackId}/read', [\App\Http\Controllers\MyTrainerController::class, 'markFeedbackRead'])->whereNumber('feedbackId');
        });

        // In-app notifications — every role has an inbox.
        Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']);
        Route::get('/notifications/unread-count', [\App\Http\Controllers\NotificationController::class, 'unreadCount']);
        Route::post('/notifications/{id}/read', [\App\Http\Controllers\NotificationController::class, 'markRead'])->whereNumber('id');
        Route::post('/notifications/read-all', [\App\Http\Controllers\NotificationController::class, 'markAllRead']);

        // Interface language: read the options, save a choice.
        Route::get('/locale', [\App\Http\Controllers\LocaleController::class, 'index']);
        Route::put('/locale', [\App\Http\Controllers\LocaleController::class, 'update']);

        /*
         * Consistency reminders — preferences and history.
         *
         * The off switch lives here because it is the member's, not an
         * administrator's: a reminder nobody can disable gets reported as spam.
         */
        Route::get('/reminders/preferences', [\App\Http\Controllers\ReminderPreferenceController::class, 'show']);
        Route::put('/reminders/preferences', [\App\Http\Controllers\ReminderPreferenceController::class, 'update']);
        Route::get('/reminders/history', [\App\Http\Controllers\ReminderPreferenceController::class, 'history']);

        // Progression — XP, level, badges
        Route::get('/me/stats', [ProgressionController::class, 'stats']);
        Route::get('/me/achievements', [ProgressionController::class, 'achievements']);
        Route::post('/me/achievements/seen', [ProgressionController::class, 'markAchievementsSeen']);
        Route::get('/leaderboard', [ProgressionController::class, 'leaderboard']);

        // Certificates — awarded for completing a milestone in full
        Route::get('/me/certificates', [\App\Http\Controllers\CertificateController::class, 'index']);
        Route::get('/me/certificates/{certificate}', [\App\Http\Controllers\CertificateController::class, 'show']);

        /*
         * Profile avatar — WRITE operations only.
         *
         * These change the member's own photo, so they require identity and are
         * scoped to the authenticated user inside the controller.
         */
        Route::post('/profile/avatar', [\App\Http\Controllers\ProfileAvatarController::class, 'store']);
        Route::delete('/profile/avatar', [\App\Http\Controllers\ProfileAvatarController::class, 'destroy']);
    });

    /*
     * Profile avatar — READ, deliberately OUTSIDE the authenticated group.
     *
     * An <img> tag cannot send an Authorization header, so this route being
     * authenticated made every avatar render as a broken image: the browser
     * requested the URL with no credentials and was refused, even for the
     * member's own photo while signed in.
     *
     * The exposure is bounded on purpose — it serves one image and nothing else,
     * requires an explicit user id, and 404s for members with no photo. See the
     * docblock on ProfileAvatarController::show for the full reasoning, and note
     * that a profile photo is data the member chose to show other members (the
     * leaderboard renders faces beside names).
     */
    Route::get('/profile/avatar', [\App\Http\Controllers\ProfileAvatarController::class, 'show']);

    /*
     * Shared management panel: trainers AND admins.
     *
     * Trainers are first-class panel users, so this group is `panel` rather
     * than `admin`. Anything it exposes is scoped inside the controller to the
     * actor's own clients via the `coaches` gate.
     */
    Route::prefix('trainer')->middleware(['auth:sanctum', 'not_suspended', 'panel'])->group(function () {
        Route::get('/dashboard', [\App\Http\Controllers\TrainerController::class, 'dashboard']);
        Route::get('/profile', [\App\Http\Controllers\TrainerController::class, 'dashboard']);

        Route::post('/availability', [\App\Http\Controllers\TrainerController::class, 'setAvailability']);
        Route::put('/profile', [\App\Http\Controllers\TrainerController::class, 'updateProfile']);

        Route::get('/clients/{user}', [\App\Http\Controllers\TrainerController::class, 'client'])->whereNumber('user');
        Route::get('/clients/{user}/live', [\App\Http\Controllers\TrainerController::class, 'live'])->whereNumber('user');
        Route::post('/clients/{user}/feedback', [\App\Http\Controllers\TrainerController::class, 'storeFeedback'])->whereNumber('user');
        Route::put('/clients/{user}/schedule', [\App\Http\Controllers\TrainerController::class, 'setSchedule'])->whereNumber('user');
        Route::post('/clients/{user}/program', [\App\Http\Controllers\TrainerController::class, 'storeProgram'])->whereNumber('user');
        Route::delete('/clients/{user}/program/{routineId}', [\App\Http\Controllers\TrainerController::class, 'destroyProgram'])->whereNumber(['user', 'routineId']);
    });

    Route::prefix('admin')->middleware(['auth:sanctum', 'not_suspended', 'admin'])->group(function () {
        Route::get('/stats', [\App\Http\Controllers\AdminStatsController::class, 'index']);

        // Audit trail + authentication security telemetry.
        Route::get('/audit-logs', [\App\Http\Controllers\AdminAuditLogController::class, 'index']);
        Route::get('/security', [\App\Http\Controllers\AdminSecurityController::class, 'index']);

        // Users. `export` is declared before the `{user}` wildcard so it is
        // not swallowed as a user id.
        Route::get('/users/export', [\App\Http\Controllers\AdminUserController::class, 'export']);
        Route::get('/users', [\App\Http\Controllers\AdminUserController::class, 'index']);
        Route::get('/users/{user}', [\App\Http\Controllers\AdminUserController::class, 'show'])->whereNumber('user');
        Route::put('/users/{user}', [\App\Http\Controllers\AdminUserController::class, 'update'])->whereNumber('user');
        Route::delete('/users/{user}', [\App\Http\Controllers\AdminUserController::class, 'destroy'])->whereNumber('user');
        Route::post('/users/{user}/suspend', [\App\Http\Controllers\AdminUserController::class, 'suspend'])->whereNumber('user');
        Route::post('/users/{user}/unsuspend', [\App\Http\Controllers\AdminUserController::class, 'unsuspend'])->whereNumber('user');
        Route::put('/users/{user}/role', [\App\Http\Controllers\AdminUserController::class, 'updateRole'])->whereNumber('user');
        Route::post('/users/{user}/reset-password', [\App\Http\Controllers\AdminUserController::class, 'resetPassword'])->whereNumber('user');
        Route::post('/users/{user}/revoke-sessions', [\App\Http\Controllers\AdminUserController::class, 'revokeSessions'])->whereNumber('user');

        /*
         * Training system administration.
         *
         * Matching is automatic, so these are the exception paths: a member
         * stranded with no trainer, a trainer who left, a mis-match needing a
         * human override. Admin-only — trainers reach their own clients through
         * the /trainer group above.
         */
        Route::prefix('training')->group(function () {
            Route::get('/trainers', [\App\Http\Controllers\AdminTrainerController::class, 'index']);
            Route::get('/pending', [\App\Http\Controllers\AdminTrainerController::class, 'pendingRequests']);
            Route::post('/rematch', [\App\Http\Controllers\AdminTrainerController::class, 'rematch']);
            Route::post('/requests/{requestId}/assign', [\App\Http\Controllers\AdminTrainerController::class, 'assign'])->whereNumber('requestId');
            Route::post('/members/{user}/reassign', [\App\Http\Controllers\AdminTrainerController::class, 'reassign'])->whereNumber('user');
            Route::post('/members/{user}/promote', [\App\Http\Controllers\AdminTrainerController::class, 'promote'])->whereNumber('user');
        });
    });

    // Public contact form (landing page) — rate limited
    Route::post('/contact', [\App\Http\Controllers\ContactController::class, 'store'])
        ->middleware('throttle:3,60');
});
