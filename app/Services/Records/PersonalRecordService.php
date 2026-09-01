<?php

namespace App\Services\Records;

use App\Models\PersonalRecord;
use App\Models\WorkoutSession;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Services\Analytics\StrengthService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Deterministic personal-record detection from a finished workout session.
 *
 * Idempotent: re-running detection on the same session replaces PRs tied to that
 * session with fresh calculations, never lowering all-time bests.
 */
class PersonalRecordService
{
    public function __construct(private readonly StrengthService $strength)
    {
    }

    /**
     * Detect and store new personal records for all exercises in a finished session.
     *
     * @return PersonalRecord[] Array of PR models tied to this session after processing.
     */
    public function detectForSession(WorkoutSession $session): array
    {
        if (!$session->finished_at) {
            return [];
        }

        // Load exercises and their sets (already eager-loaded in controller, but ensure)
        $session->load(['workoutExercises.exercise', 'workoutExercises.sets']);

        if ($session->workoutExercises->isEmpty()) {
            return [];
        }

        $user = $session->user;

        // Delete existing PRs tied to this session to avoid stale data.
        PersonalRecord::where('workout_session_id', $session->id)->delete();

        $created = [];

        foreach ($session->workoutExercises as $workoutExercise) {
            $exercise = $workoutExercise->exercise;
            if (!$exercise) {
                continue;
            }

            $sets = $workoutExercise->sets->filter(fn ($s) => $s->weight_kg !== null && $s->reps !== null);

            if ($sets->isEmpty()) {
                continue;
            }

            // --- weight PR: max single-set weight ---
            $maxWeight = $sets->max('weight_kg');
            if ($maxWeight !== null) {
                $this->upsertPr($user, $exercise, 'weight', (float) $maxWeight, $session);
            }

            // --- one_rm PR: max estimated 1RM per set (Epley, reps 1..12) ---
            $maxE1rm = null;
            foreach ($sets as $set) {
                $e1rm = $this->strength::estimated1rm((float) $set->weight_kg, (int) $set->reps);
                if ($e1rm !== null && ($maxE1rm === null || $e1rm > $maxE1rm)) {
                    $maxE1rm = $e1rm;
                }
            }
            if ($maxE1rm !== null) {
                $this->upsertPr($user, $exercise, 'one_rm', $maxE1rm, $session);
            }

            // --- volume PR: sum of weight*reps for this exercise in this session ---
            $volume = $sets->sum(fn ($s) => (float) $s->weight_kg * (int) $s->reps);
            if ($volume > 0) {
                $this->upsertPr($user, $exercise, 'volume', $volume, $session);
            }
        }

        // Return PRs that are now tied to this session (after all inserts/updates)
        return PersonalRecord::where('workout_session_id', $session->id)->get()->all();
    }

    /**
     * Upsert a PR if candidate value is greater than any existing PR for the same
     * (user, exercise, type), excluding records from the current session (already deleted).
     * Uses firstOrNew to avoid lowering.
     */
    private function upsertPr($user, $exercise, string $type, float $value, WorkoutSession $session): void
    {
        // Find existing PR for this user+exercise+type (excluding this session already gone)
        $existing = PersonalRecord::where('user_id', $user->id)
            ->where('exercise_id', $exercise->id)
            ->where('pr_type', $type)
            ->first();

        // Only create/update if candidate is strictly greater than existing, or no existing
        if ($existing && $value <= (float) $existing->value) {
            return;
        }

        // Upsert: use updateOrCreate on the unique constraint (user_id, exercise_id, pr_type)
        PersonalRecord::updateOrCreate(
            [
                'user_id' => $user->id,
                'exercise_id' => $exercise->id,
                'pr_type' => $type,
            ],
            [
                'value' => $value,
                'workout_session_id' => $session->id,
                'achieved_at' => $session->started_at,
            ]
        );
    }
}