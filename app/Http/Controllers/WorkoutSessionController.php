<?php

namespace App\Http\Controllers;

use App\Models\WorkoutSession;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Models\Exercise;
use App\Jobs\GenerateInsight;
use App\Services\Records\PersonalRecordService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WorkoutSessionController extends Controller
{
    public function index(Request $request)
    {
        $sessions = $request->user()
            ->workoutSessions()
            ->withCount('workoutExercises')
            ->orderBy('started_at', 'desc')
            ->paginate(20);

        return response()->json($sessions);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'started_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $session = $request->user()->workoutSessions()->create([
            'started_at' => $validated['started_at'],
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($session, 201);
    }

    public function show(WorkoutSession $workoutSession)
    {
        $this->authorize('view', $workoutSession);

        $workoutSession->load(['workoutExercises.exercise', 'workoutExercises.sets']);

        return response()->json($workoutSession);
    }

    public function finish(Request $request, WorkoutSession $workoutSession)
    {
        $this->authorize('update', $workoutSession);

        $validated = $request->validate([
            'notes' => 'nullable|string',
        ]);

        $workoutSession->update([
            'finished_at' => now(),
            'duration_minutes' => $workoutSession->started_at->diffInMinutes(now()),
            'notes' => $validated['notes'] ?? $workoutSession->notes,
        ]);

        // PR detection – must not fail the finish response
        $prsDetected = 0;
        try {
            $service = app(PersonalRecordService::class);
            $prs = $service->detectForSession($workoutSession);
            $prsDetected = count($prs);
        } catch (\Throwable $e) {
            Log::warning('PR detection failed for session '.$workoutSession->id, ['error' => $e->getMessage()]);
        }

        // AI insight generation – fire-and-forget; never block finish.
        try {
            GenerateInsight::dispatch($workoutSession->user_id);
        } catch (\Throwable $e) {
            Log::warning('Insight dispatch failed for session '.$workoutSession->id, ['error' => $e->getMessage()]);
        }

        $workoutSession->load(['workoutExercises.exercise', 'workoutExercises.sets']);

        $sets = $workoutSession->workoutExercises->flatMap->sets;

        $summary = [
            'exercises' => $workoutSession->workoutExercises->count(),
            'sets' => $sets->count(),
            'volume_kg' => (float) $sets->whereNotNull('weight_kg')->whereNotNull('reps')
                ->sum(fn ($set) => $set->weight_kg * $set->reps),
            'prs_detected' => $prsDetected,
        ];

        return response()->json([
            'session' => $workoutSession,
            'summary' => $summary,
        ]);
    }

    public function update(Request $request, WorkoutSession $workoutSession)
    {
        $this->authorize('update', $workoutSession);

        $validated = $request->validate([
            'notes' => 'nullable|string',
        ]);

        $workoutSession->update($validated);

        return response()->json($workoutSession);
    }

    public function destroy(WorkoutSession $workoutSession)
    {
        $this->authorize('delete', $workoutSession);

        $workoutSession->delete();

        return response()->json(null, 204);
    }
}