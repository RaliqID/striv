<?php

namespace App\Http\Controllers;

use App\Models\WorkoutSession;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class WorkoutExerciseController extends Controller
{
    public function index(Request $request, WorkoutSession $workout_session): JsonResponse
    {
        $this->authorize('view', $workout_session);

        $exercises = $workout_session->workoutExercises()
            ->with(['exercise.muscleGroups', 'sets'])
            ->orderBy('order')
            ->get();

        return response()->json($exercises);
    }

    public function store(Request $request, WorkoutSession $workout_session): JsonResponse
    {
        $this->authorize('update', $workout_session);

        $validated = $request->validate([
            'exercise_id' => 'required|integer|exists:exercises,id',
            'notes' => 'nullable|string',
        ]);

        $nextOrder = (int) $workout_session->workoutExercises()->max('order') + 1;

        $workoutExercise = $workout_session->workoutExercises()->create([
            'exercise_id' => $validated['exercise_id'],
            'order' => $nextOrder,
            'notes' => $validated['notes'] ?? null,
        ]);

        $workoutExercise->load('exercise.muscleGroups');

        return response()->json($workoutExercise, 201);
    }

    public function destroy(Request $request, WorkoutSession $workout_session, WorkoutExercise $workoutExercise): JsonResponse
    {
        $this->authorize('update', $workout_session);

        if ($workoutExercise->workout_session_id !== $workout_session->id) {
            abort(404);
        }

        $workoutExercise->delete();

        return response()->json(null, 204);
    }

    public function storeSet(Request $request, WorkoutSession $workout_session, WorkoutExercise $workoutExercise): JsonResponse
    {
        $this->authorize('update', $workout_session);

        if ($workoutExercise->workout_session_id !== $workout_session->id) {
            abort(404);
        }

        $validated = $this->validateSet($request);

        $nextSetNumber = (int) $workoutExercise->sets()->max('set_number') + 1;

        $set = $workoutExercise->sets()->create([
            'set_number' => $nextSetNumber,
            'weight_kg' => $validated['weight_kg'] ?? null,
            'reps' => $validated['reps'] ?? null,
            'rpe' => $validated['rpe'] ?? null,
        ]);

        return response()->json($set, 201);
    }

    public function updateSet(Request $request, WorkoutSession $workout_session, WorkoutExercise $workoutExercise, WorkoutSet $set): JsonResponse
    {
        $this->authorize('update', $workout_session);

        if ($workoutExercise->workout_session_id !== $workout_session->id || $set->workout_exercise_id !== $workoutExercise->id) {
            abort(404);
        }

        $validated = $this->validateSet($request);

        $set->update([
            'weight_kg' => $validated['weight_kg'] ?? $set->weight_kg,
            'reps' => $validated['reps'] ?? $set->reps,
            'rpe' => $validated['rpe'] ?? $set->rpe,
        ]);

        return response()->json($set);
    }

    public function destroySet(Request $request, WorkoutSession $workout_session, WorkoutExercise $workoutExercise, WorkoutSet $set): JsonResponse
    {
        $this->authorize('update', $workout_session);

        if ($workoutExercise->workout_session_id !== $workout_session->id || $set->workout_exercise_id !== $workoutExercise->id) {
            abort(404);
        }

        $set->delete();

        return response()->json(null, 204);
    }

    private function validateSet(Request $request): array
    {
        return $request->validate([
            'weight_kg' => 'nullable|numeric|between:0,1000',
            'reps' => 'nullable|integer|between:0,500',
            'rpe' => 'nullable|integer|between:1,10',
        ]);
    }
}
