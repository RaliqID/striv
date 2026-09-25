<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\WorkoutSessionController;
use App\Http\Controllers\WorkoutExerciseController;
use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\GoalController;

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
        Route::apiResource('workout-sessions', WorkoutSessionController::class);
        Route::post('/workout-sessions/{workout_session}/finish', [WorkoutSessionController::class, 'finish']);

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

        // Insights (deterministic feed + AI persistence)
        Route::get('/insights', [\App\Http\Controllers\InsightController::class, 'index']);
        Route::post('/insights/generate', [\App\Http\Controllers\InsightController::class, 'generate']);

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
        Route::post('/reviews/weekly/generate', [\App\Http\Controllers\WeeklyReviewController::class, 'generate']);

        // AI Coach chat — sessions
        Route::get('/chat/sessions', [\App\Http\Controllers\ChatSessionController::class, 'index']);
        Route::post('/chat/sessions', [\App\Http\Controllers\ChatSessionController::class, 'store']);
        Route::get('/chat/sessions/{sessionId}', [\App\Http\Controllers\ChatSessionController::class, 'show'])->whereNumber('sessionId');
        Route::delete('/chat/sessions/{sessionId}', [\App\Http\Controllers\ChatSessionController::class, 'destroy'])->whereNumber('sessionId');

        // AI Coach chat — conversation
        Route::get('/chat', [\App\Http\Controllers\ChatController::class, 'index']);
        Route::post('/chat', [\App\Http\Controllers\ChatController::class, 'store']);
        Route::delete('/chat', [\App\Http\Controllers\ChatController::class, 'destroy']);
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
    });

    // Public contact form (landing page) — rate limited
    Route::post('/contact', [\App\Http\Controllers\ContactController::class, 'store'])
        ->middleware('throttle:3,60');
});
