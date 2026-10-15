<?php

namespace App\Services\Training;

use App\Models\Routine;
use App\Models\TrainerAssignment;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Carbon;

/**
 * Answers "what should I train today?".
 *
 * This is the piece that makes the workout screen automatic instead of an empty
 * form. The member should not have to decide anything at the gym: their trainer
 * (or the generator that stood in for one) already decided. So the server works
 * out which scheduled day today is, pulls the prescribed programme, and hands
 * the client a ready-to-fill plan.
 *
 * The hard case is a member with a schedule but no programme, or a programme but
 * no schedule for today. Those return a clearly-labelled result rather than an
 * error, because "rest day" is a legitimate answer and a 404 would make the UI
 * treat a normal state as a failure.
 */
class TodayPlanService
{
    /**
     * Build today's plan for a member.
     *
     * @return array{
     *   status: string,
     *   is_rest_day: bool,
     *   day_of_week: int,
     *   schedule: array|null,
     *   routine: array|null,
     *   active_session: array|null,
     *   message: string
     * }
     */
    public function forUser(User $user, ?Carbon $today = null): array
    {
        $today ??= Carbon::now();
        $isoDay = (int) $today->isoWeekday(); // 1 = Monday … 7 = Sunday

        // An unfinished session takes precedence: the member is mid-workout and
        // the UI must send them back into it rather than starting a new one.
        $active = WorkoutSession::where('user_id', $user->id)
            ->whereNull('finished_at')
            ->latest('started_at')
            ->first();

        $assignment = $user->trainerAssignments()
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with(['schedules', 'trainer'])
            ->latest('id')
            ->first();

        $slot = $assignment?->schedules
            ->firstWhere('day_of_week', $isoDay);

        $routine = $this->routineFor($assignment, $isoDay, $slot);

        // A scheduled day with nothing prescribed (or a schedule with no slot
        // for today) is a rest day, not a failure.
        $isRestDay = $slot === null;

        return [
            'status' => match (true) {
                $active !== null => 'in_progress',
                $isRestDay => 'rest_day',
                $routine !== null => 'ready',
                default => 'no_programme',
            },
            'is_rest_day' => $isRestDay,
            'day_of_week' => $isoDay,
            'schedule' => $slot !== null ? [
                'id' => $slot->id,
                'day_name' => $slot->dayName(),
                'time_slot' => $slot->time_slot,
                'focus' => $slot->focus,
                'confirmed' => $slot->confirmed_at !== null,
            ] : null,
            'routine' => $routine !== null ? $this->formatRoutine($routine) : null,
            'active_session' => $active !== null ? [
                'id' => $active->id,
                'started_at' => $active->started_at?->toIso8601String(),
            ] : null,
            'trainer' => $assignment?->trainer !== null ? [
                'name' => $assignment->trainer->name,
                'specialization' => $assignment->trainer->specialization,
            ] : null,
            'message' => $this->messageFor($active !== null, $isRestDay, $routine !== null, $assignment !== null),
        ];
    }

    /**
     * Which programme to run today.
     *
     * Preference order:
     *   1. a routine whose name matches today's scheduled focus, so a trainer
     *      with several blocks gets the right one
     *   2. otherwise the most recent prescribed routine, since for a single-plan
     *      member (the common case) that is simply "the programme"
     *
     * Returns null when the member has no trainer at all, which the caller
     * renders as "no programme yet" rather than inventing a workout.
     */
    private function routineFor(?TrainerAssignment $assignment, int $isoDay, $slot): ?Routine
    {
        if ($assignment === null) {
            return null;
        }

        $routines = $assignment->routines()->with('routineExercises.exercise')->latest('id')->get();

        if ($routines->isEmpty()) {
            return null;
        }

        if ($slot?->focus) {
            $focus = mb_strtolower($slot->focus);
            $matched = $routines->first(function (Routine $r) use ($focus) {
                $name = mb_strtolower($r->name);
                // Loose match on the first significant word of the focus label.
                foreach (preg_split('/[\s\/,]+/', $focus) as $word) {
                    if (mb_strlen($word) > 3 && str_contains($name, $word)) {
                        return true;
                    }
                }

                return false;
            });

            if ($matched !== null) {
                return $matched;
            }
        }

        return $routines->first();
    }

    private function messageFor(bool $hasActive, bool $isRestDay, bool $hasRoutine, bool $hasTrainer): string
    {
        return match (true) {
            $hasActive => 'workout.msgResume',
            $isRestDay => 'workout.msgRestDay',
            $hasRoutine => 'workout.msgReady',
            $hasTrainer => 'workout.msgNoProgramme',
            default => 'workout.msgNoTrainer',
        };
    }

    /** @return array<string, mixed> */
    private function formatRoutine(Routine $routine): array
    {
        return [
            'id' => $routine->id,
            'name' => $routine->name,
            'notes' => $routine->notes,
            'auto_generated' => (bool) $routine->auto_generated,
            'est_duration_minutes' => $routine->est_duration_minutes !== null
                ? (int) $routine->est_duration_minutes : null,
            'exercises' => $routine->routineExercises->map(fn ($re) => [
                'id' => $re->id,
                'exercise_id' => $re->exercise_id,
                'name' => $re->exercise?->name,
                'order' => (int) $re->order,
                'target_sets' => $re->target_sets !== null ? (int) $re->target_sets : null,
                'target_reps' => $re->target_reps !== null ? (int) $re->target_reps : null,
                'target_weight_kg' => $re->target_weight_kg !== null ? (float) $re->target_weight_kg : null,
            ])->values()->all(),
        ];
    }
}
