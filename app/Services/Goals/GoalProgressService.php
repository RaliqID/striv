<?php

namespace App\Services\Goals;

use App\Models\Goal;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Facades\DB;

/**
 * Single source of truth for goal progress.
 *
 * Progress used to be computed in the controller from an all-time personal
 * record, which meant the definition lived in one place but was duplicated by
 * the frontend (one extra HTTP request per goal, only to receive the same
 * number). The rule now lives here so the list endpoint, the progress endpoint
 * and auto-completion all agree by construction.
 */
class GoalProgressService
{
    /**
     * The best value the user has achieved for this goal's standard.
     *
     * "Best" is standard-dependent, which is the whole point:
     *
     *  - weight goal with target_reps set: the heaviest weight lifted for AT
     *    LEAST that many reps. A 1-rep max of 120kg must not satisfy a
     *    "100kg x 5" goal, because the standard is the rep count, not the load.
     *  - weight / one_rm without target_reps: the heaviest weight (or best
     *    estimated 1RM) regardless of reps.
     *  - reps: the most reps performed in a single set at any weight.
     *  - workouts: total finished sessions.
     */
    public function currentValue(Goal $goal): float
    {
        return match ($goal->target_type) {
            'weight' => $this->bestWeight($goal),
            'one_rm' => $this->bestEstimatedOneRm($goal),
            'reps' => $this->bestReps($goal),
            'workouts' => $this->finishedWorkoutCount($goal->user_id),
            default => 0.0,
        };
    }

    /**
     * Progress towards the target, as a percentage of the distance from the
     * baseline to the target.
     *
     * Baseline-relative rather than absolute: a user who starts at 60kg and is
     * chasing 80kg is 50% of the way there at 70kg. The old absolute formula
     * reported 87.5% at the same point, which overstated progress and made the
     * bar meaningless. Overshoot is clamped to 100 for display.
     */
    public function progressPercentage(Goal $goal, ?float $currentValue = null): float
    {
        $current = $currentValue ?? $this->currentValue($goal);
        $start = (float) ($goal->starting_value ?? 0);
        $target = (float) $goal->target_value;

        $span = $target - $start;

        // A goal with no span is already at its target (or misconfigured);
        // reporting 100 avoids a division by zero.
        if ($span <= 0) {
            return $current >= $target ? 100.0 : 0.0;
        }

        return round(max(0.0, min(100.0, (($current - $start) / $span) * 100)), 2);
    }

    /**
     * Whether the goal's standard has been met.
     */
    public function isAchieved(Goal $goal, ?float $currentValue = null): bool
    {
        $current = $currentValue ?? $this->currentValue($goal);

        return $current >= (float) $goal->target_value;
    }

    /**
     * Mark an active goal complete once its target is met.
     *
     * Returns the goal, refreshed only when its status actually changed, so the
     * caller can avoid needless writes on every read of the list.
     */
    public function syncCompletion(Goal $goal, ?float $currentValue = null): Goal
    {
        if ($goal->status !== 'active') {
            return $goal;
        }

        if (! $this->isAchieved($goal, $currentValue)) {
            return $goal;
        }

        $goal->forceFill([
            'status' => 'completed',
            'completed_at' => now(),
        ])->save();

        return $goal;
    }

    /**
     * Baseline to freeze when a goal is created.
     *
     * Freezing the baseline at creation means a subsequent personal record
     * cannot retroactively move the starting line and make a goal look closer
     * to completion than it is.
     *
     * `targetReps` must be supplied for weight goals: the baseline has to be
     * measured against the SAME standard the goal uses. A user with a 100kg
     * single and a 60kg set of 5 has a baseline of 60 for a "5 reps" goal —
     * computing it without the rep standard would yield 100 and reject the
     * goal as already met.
     */
    public function baselineFor(
        User $user,
        string $targetType,
        ?int $exerciseId,
        ?int $targetReps = null,
    ): float {
        $probe = new Goal([
            'target_type' => $targetType,
            'target_value' => 0,
            'starting_value' => 0,
            'target_reps' => $targetReps,
        ]);
        $probe->user_id = $user->id;
        $probe->exercise_id = $exerciseId;

        return $this->currentValue($probe);
    }

    /**
     * Heaviest weight for this exercise, honouring the goal's rep standard.
     */
    private function bestWeight(Goal $goal): float
    {
        if (! $goal->exercise_id) {
            return 0.0;
        }

        $query = $this->setQuery($goal)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps');

        // The rep count is the standard: only sets meeting it count.
        if ($goal->target_reps !== null) {
            $query->where('s.reps', '>=', (int) $goal->target_reps);
        }

        return (float) ($query->max('s.weight_kg') ?? 0.0);
    }

    /**
     * Best estimated 1RM (Epley), only for sets whose reps are in the valid range.
     */
    private function bestEstimatedOneRm(Goal $goal): float
    {
        if (! $goal->exercise_id) {
            return 0.0;
        }

        $sets = $this->setQuery($goal)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->whereBetween('s.reps', [1, 12])
            ->get(['s.weight_kg', 's.reps']);

        $best = 0.0;
        foreach ($sets as $set) {
            $weight = (float) $set->weight_kg;
            $reps = (int) $set->reps;
            $e1rm = $reps === 1 ? $weight : $weight * (1 + $reps / 30);
            if ($e1rm > $best) {
                $best = $e1rm;
            }
        }

        return round($best, 2);
    }

    /**
     * Most reps performed in a single set.
     */
    private function bestReps(Goal $goal): float
    {
        if (! $goal->exercise_id) {
            return 0.0;
        }

        return (float) ($this->setQuery($goal)->whereNotNull('s.reps')->max('s.reps') ?? 0.0);
    }

    private function finishedWorkoutCount(int $userId): float
    {
        return (float) WorkoutSession::where('user_id', $userId)
            ->whereNotNull('finished_at')
            ->count();
    }

    /**
     * Sets table scoped to this goal's user + exercise, joined through to sets.
     */
    private function setQuery(Goal $goal)
    {
        return DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.user_id', $goal->user_id)
            ->where('we.exercise_id', $goal->exercise_id)
            // Only finished sessions count: an in-progress session must not
            // satisfy a goal the user has not actually completed.
            ->whereNotNull('ws.finished_at');
    }
}
