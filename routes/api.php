<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\WorkoutSessionController;
use App\Http\Controllers\WorkoutExerciseController;
use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\GoalController;

Route::prefix('v1')->group(function () {

    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::get('/auth/google/redirect', [AuthController::class, 'redirectToGoogle']);
    Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback']);

    Route::middleware('auth:sanctum')->group(function () {
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
        Route::apiResource('goals', GoalController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
        Route::get('/goals/{goal}/progress', [GoalController::class, 'progress']);

        // Profile
        Route::get('/profile', [\App\Http\Controllers\ProfileController::class, 'show']);
        Route::put('/profile', [\App\Http\Controllers\ProfileController::class, 'update']);

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

    // Public contact form (landing page) — rate limited
    Route::post('/contact', [\App\Http\Controllers\ContactController::class, 'store'])
        ->middleware('throttle:3,60');
});
