<?php

namespace App\Http\Controllers;

use App\Models\Routine;
use App\Models\WorkoutSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RoutineController extends Controller
{
    public function index(Request $request)
    {
        $routines = $request->user()
            ->routines()
            ->with('routineExercises.exercise')
            ->withCount('routineExercises')
            ->orderBy('updated_at', 'desc')
            ->paginate(20);

        return response()->json($routines);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'notes' => 'nullable|string',
            'est_duration_minutes' => 'nullable|integer|min:5|max:600',
            'exercises' => 'required|array|min:1|max:20',
            'exercises.*.exercise_id' => 'required|integer|exists:exercises,id',
            'exercises.*.target_sets' => 'nullable|integer|min:1|max:20',
            'exercises.*.target_reps' => 'nullable|integer|min:1|max:500',
            'exercises.*.target_weight_kg' => 'nullable|numeric|min:0|max:1000',
        ]);

        $routine = DB::transaction(function () use ($request, $validated) {
            $routine = $request->user()->routines()->create([
                'name' => $validated['name'],
                'notes' => $validated['notes'] ?? null,
                'est_duration_minutes' => $validated['est_duration_minutes'] ?? null,
            ]);

            foreach ($validated['exercises'] as $i => $ex) {
                $routine->routineExercises()->create([
                    'exercise_id' => $ex['exercise_id'],
                    'order' => $i + 1,
                    'target_sets' => $ex['target_sets'] ?? null,
                    'target_reps' => $ex['target_reps'] ?? null,
                    'target_weight_kg' => $ex['target_weight_kg'] ?? null,
                ]);
            }

            return $routine;
        });

        return response()->json($routine->load('routineExercises.exercise'), 201);
    }

    public function show(Routine $routine)
    {
        $this->authorize('view', $routine);

        return response()->json($routine->load('routineExercises.exercise'));
    }

    public function update(Request $request, Routine $routine)
    {
        $this->authorize('update', $routine);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'notes' => 'sometimes|nullable|string',
            'est_duration_minutes' => 'sometimes|nullable|integer|min:5|max:600',
            'exercises' => 'sometimes|required|array|min:1|max:20',
            'exercises.*.exercise_id' => 'required|integer|exists:exercises,id',
            'exercises.*.target_sets' => 'nullable|integer|min:1|max:20',
            'exercises.*.target_reps' => 'nullable|integer|min:1|max:500',
            'exercises.*.target_weight_kg' => 'nullable|numeric|min:0|max:1000',
        ]);

        DB::transaction(function () use ($routine, $validated) {
            $routine->update($validated);

            if (isset($validated['exercises'])) {
                $routine->routineExercises()->delete();
                foreach ($validated['exercises'] as $i => $ex) {
                    $routine->routineExercises()->create([
                        'exercise_id' => $ex['exercise_id'],
                        'order' => $i + 1,
                        'target_sets' => $ex['target_sets'] ?? null,
                        'target_reps' => $ex['target_reps'] ?? null,
                        'target_weight_kg' => $ex['target_weight_kg'] ?? null,
                    ]);
                }
            }
        });

        return response()->json($routine->fresh()->load('routineExercises.exercise'));
    }

    public function destroy(Routine $routine)
    {
        $this->authorize('delete', $routine);

        $routine->delete();

        return response()->json(null, 204);
    }

    /**
     * Start a workout session pre-filled from a routine.
     * Creates a WorkoutSession, attaches the routine's exercises with
     * target placeholder sets, and returns the session.
     */
    public function start(Request $request, Routine $routine)
    {
        $this->authorize('view', $routine);

        $request->validate([
            'started_at' => 'nullable|date',
        ]);

        $routine->load('routineExercises.exercise');

        $session = DB::transaction(function () use ($request, $routine) {
            $session = $request->user()->workoutSessions()->create([
                'started_at' => $request->input('started_at', now()->toIso8601String()),
                'notes' => 'Routine: ' . $routine->name,
            ]);

            foreach ($routine->routineExercises as $re) {
                $we = $session->workoutExercises()->create([
                    'exercise_id' => $re->exercise_id,
                    'order' => $re->order,
                    'notes' => null,
                ]);
                // Create target_sets empty set rows so user just fills kg/reps
                $sets = max(1, $re->target_sets ?? 1);
                for ($i = 1; $i <= $sets; $i++) {
                    $we->sets()->create([
                        'set_number' => $i,
                        'weight_kg' => $re->target_weight_kg,
                        'reps' => $re->target_reps,
                    ]);
                }
            }

            return $session;
        });

        return response()->json($session->load('workoutExercises.exercise', 'workoutExercises.sets'), 201);
    }
}
