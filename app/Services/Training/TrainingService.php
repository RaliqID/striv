<?php

namespace App\Services\Training;

use App\Models\TrainerAssignment;
use App\Models\TrainerFeedback;
use App\Models\TrainingRequest;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read model for the member↔trainer relationship.
 *
 * Both sides of the relationship need the same underlying facts in different
 * shapes: the member sees "my trainer and my programme", the trainer sees "this
 * client and their progress". Keeping the formatting here means the two
 * endpoints cannot drift — a field added for the trainer is automatically
 * available to the member view too, and the privacy rules are applied once.
 */
class TrainingService
{
    /**
     * Everything the member sees on their "My Trainer" screen.
     *
     * @return array<string, mixed>
     */
    public function memberOverview(User $member): array
    {
        $request = $member->trainingRequests()
            ->latest('id')
            ->first();

        $assignment = $member->trainerAssignments()
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with(['trainer', 'schedules'])
            ->latest('id')
            ->first();

        return [
            'request' => $request !== null ? $this->formatRequest($request) : null,
            'state' => $this->memberState($request, $assignment),
            'trainer' => $assignment?->trainer !== null
                ? $this->formatTrainer($assignment->trainer)
                : null,
            'assignment' => $assignment !== null ? $this->formatAssignment($assignment) : null,
            'schedule' => $assignment !== null
                ? $assignment->schedules->map(fn ($s) => $this->formatSchedule($s))->values()->all()
                : [],
            'program' => $assignment !== null ? $this->programFor($assignment) : [],
            'feedback' => $member->feedbackReceived()
                ->with('trainer')
                ->latest('id')
                ->limit(30)
                ->get()
                ->map(fn ($f) => $this->formatFeedback($f))
                ->all(),
        ];
    }

    /**
     * The single word the frontend routes on, so the UI never has to
     * re-derive "am I still waiting?" from several nullable fields.
     *
     *   unmatched   — no trainer yet (still pending)
     *   await_schedule — trainer assigned, schedule not confirmed
     *   active      — schedule confirmed, coaching in progress
     *   completed   — programme finished
     *   rejected    — no trainer available
     */
    public function memberState(?TrainingRequest $request, ?TrainerAssignment $assignment): string
    {
        if ($assignment !== null) {
            return $assignment->isConfirmed() ? 'active' : 'await_schedule';
        }

        return match ($request?->status) {
            TrainingRequest::STATUS_PENDING => 'unmatched',
            TrainingRequest::STATUS_MATCHED => 'await_schedule',
            TrainingRequest::STATUS_COMPLETED => 'completed',
            TrainingRequest::STATUS_REJECTED => 'rejected',
            default => 'unmatched',
        };
    }

    /**
     * The trainer's client list: who they coach, and how that client is doing.
     *
     * `withLastActivity` matters because the trainer's first question about a
     * client is almost always "are they actually training?" — answering it in
     * the list avoids a round trip per client.
     *
     * @return array<int, array<string, mixed>>
     */
    public function trainerClientList(User $trainer): array
    {
        $assignments = TrainerAssignment::where('trainer_id', $trainer->id)
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with(['user.profile', 'schedules'])
            ->latest('id')
            ->get();

        return $assignments
            ->map(fn (TrainerAssignment $a) => $this->formatClientRow($a))
            ->all();
    }

    /** A single client, from the trainer's side. */
    public function clientDetail(User $trainer, User $member): ?array
    {
        $assignment = TrainerAssignment::where('trainer_id', $trainer->id)
            ->where('user_id', $member->id)
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with(['schedules'])
            ->first();

        if ($assignment === null) {
            return null;
        }

        return [
            'client' => [
                'id' => $member->id,
                'name' => $member->name,
                'email' => $member->email,
                'profile' => $member->profile?->only([
                    'age', 'location', 'weight_kg', 'height_cm', 'target_weight_kg',
                    'experience_level', 'primary_goal', 'training_frequency',
                ]),
            ],
            'assignment' => $this->formatAssignment($assignment),
            'schedule' => $assignment->schedules->map(fn ($s) => $this->formatSchedule($s))->values()->all(),
            'program' => $this->programFor($assignment),
            'stats' => $this->clientStats($member),
            'recent_sessions' => $this->recentSessions($member),
            'live_session' => $this->liveSession($member),
            'feedback' => $member->feedbackReceived()
                ->with('trainer')
                ->latest('id')
                ->limit(50)
                ->get()
                ->map(fn ($f) => $this->formatFeedback($f))
                ->all(),
        ];
    }

    /**
     * The session a member has open right now, if any.
     *
     * "Live" means finished_at IS NULL — the single source of truth for whether
     * someone is mid-workout. Returns null when they are not training, which is
     * the common case and must not be treated as an error.
     */
    public function liveSession(User $member): ?array
    {
        $session = WorkoutSession::where('user_id', $member->id)
            ->whereNull('finished_at')
            ->with(['workoutExercises.exercise', 'workoutExercises.sets'])
            ->latest('started_at')
            ->first();

        if ($session === null) {
            return null;
        }

        $elapsed = $session->started_at !== null
            ? (int) $session->started_at->diffInMinutes(now())
            : 0;

        return [
            'id' => $session->id,
            'started_at' => $session->started_at?->toIso8601String(),
            'elapsed_minutes' => $elapsed,
            'exercises' => $session->workoutExercises->map(function ($we) {
                return [
                    'id' => $we->id,
                    'name' => $we->exercise?->name,
                    'sets' => $we->sets->map(fn ($s) => [
                        'id' => $s->id,
                        'weight_kg' => $s->weight_kg !== null ? (float) $s->weight_kg : null,
                        'reps' => $s->reps !== null ? (int) $s->reps : null,
                        'completed_at' => $s->created_at?->toIso8601String(),
                    ])->values()->all(),
                ];
            })->values()->all(),
            // Freshly recomputed so the trainer's live view shows current totals.
            'totals' => $this->sessionTotals($session),
        ];
    }

    /** Aggregate counters a trainer uses to judge a client at a glance. */
    public function clientStats(User $member): array
    {
        $cutoff30 = now()->subDays(30);

        $totals = DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.user_id', $member->id)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->selectRaw('count(*) as set_count, COALESCE(SUM(s.weight_kg * s.reps), 0) as volume')
            ->first();

        return [
            'workouts_total' => WorkoutSession::where('user_id', $member->id)->count(),
            'workouts_30d' => WorkoutSession::where('user_id', $member->id)
                ->where('started_at', '>=', $cutoff30)->count(),
            'sets_total' => (int) ($totals->set_count ?? 0),
            'volume_total_kg' => round((float) ($totals->volume ?? 0), 2),
            'last_session_at' => WorkoutSession::where('user_id', $member->id)
                ->whereNotNull('finished_at')
                ->latest('finished_at')
                ->value('finished_at'),
            'goals_active' => $member->goals()->where('status', 'active')->count(),
            'is_training_now' => WorkoutSession::where('user_id', $member->id)
                ->whereNull('finished_at')->exists(),
        ];
    }

    /**
     * Recent completed sessions, newest first — the trainer's review material.
     *
     * @return array<int, array<string, mixed>>
     */
    public function recentSessions(User $member, int $limit = 10): array
    {
        return WorkoutSession::where('user_id', $member->id)
            ->whereNotNull('finished_at')
            ->with([
                'workoutExercises.exercise',
                'workoutExercises.sets.photo',
            ])
            ->latest('finished_at')
            ->limit($limit)
            ->get()
            ->map(fn (WorkoutSession $s) => [
                'id' => $s->id,
                'started_at' => $s->started_at?->toIso8601String(),
                'finished_at' => $s->finished_at?->toIso8601String(),
                'duration_minutes' => $s->duration_minutes !== null ? (int) $s->duration_minutes : null,
                'notes' => $s->notes,
                'totals' => $this->sessionTotals($s),
                'exercises' => $s->workoutExercises->map(fn ($we) => [
                    'name' => $we->exercise?->name,
                    'sets' => $we->sets->map(fn ($set) => [
                        'id' => $set->id,
                        'weight_kg' => $set->weight_kg !== null ? (float) $set->weight_kg : null,
                        'reps' => $set->reps !== null ? (int) $set->reps : null,
                        // The evidence for this set, so the trainer can see what
                        // was actually photographed rather than only that a
                        // number was typed. `proven` is what makes the session
                        // reviewable: a set without it is a claim, not a fact.
                        'proven' => $set->isProven(),
                        'photo' => $set->photo !== null ? $this->formatPhoto($set->photo) : null,
                    ])->values()->all(),
                ])->values()->all(),
            ])
            ->all();
    }

    /**
     * A set photo as the trainer sees it.
     *
     * The AI verdict travels with the image so the trainer can tell apart a
     * confident match, a photo the system was unsure about, and one it refused
     * — three situations that need different follow-up.
     *
     * @return array<string, mixed>
     */
    private function formatPhoto(\App\Models\WorkoutSetPhoto $photo): array
    {
        return [
            'id' => $photo->id,
            'verdict' => $photo->ai_verdict,
            // Surfaced so the trainer can tell "we checked and it matched" apart
            // from "the check could not run" — the second needs a human look.
            'unverified' => $photo->wasUnverified(),
            'analysis' => $photo->ai_analysis,
            'confidence' => $photo->ai_confidence,
            'trainer_note' => $photo->trainer_note,
            'reviewed' => $photo->isReviewed(),
            'created_at' => $photo->created_at?->toIso8601String(),
            // Served through the authorised file route, never a public URL.
            'url' => route('workout-set-photo.file', ['photo' => $photo->id]),
        ];
    }

    /**
     * The routines prescribed by this assignment, with their exercises.
     *
     * This is the "programme" the trainer built to move the member toward the
     * goal they asked for — the member does not author these.
     *
     * @return array<int, array<string, mixed>>
     */
    public function programFor(TrainerAssignment $assignment): array
    {
        return $assignment->routines()
            ->with(['routineExercises.exercise'])
            ->get()
            ->map(fn ($routine) => [
                'id' => $routine->id,
                'name' => $routine->name,
                'notes' => $routine->notes,
                // Lets the UI label a generated plan as a starting point the
                // trainer is still reviewing, rather than as final guidance.
                'auto_generated' => (bool) $routine->auto_generated,
                'est_duration_minutes' => $routine->est_duration_minutes !== null
                    ? (int) $routine->est_duration_minutes : null,
                'created_at' => $routine->created_at?->toIso8601String(),
                'exercises' => $routine->routineExercises->map(fn ($re) => [
                    'id' => $re->id,
                    'exercise_id' => $re->exercise_id,
                    'name' => $re->exercise?->name,
                    'order' => (int) $re->order,
                    'target_sets' => $re->target_sets !== null ? (int) $re->target_sets : null,
                    'target_reps' => $re->target_reps !== null ? (int) $re->target_reps : null,
                    'target_weight_kg' => $re->target_weight_kg !== null ? (float) $re->target_weight_kg : null,
                ])->values()->all(),
            ])
            ->all();
    }

    // ------------------------------------------------------------------
    // Formatters
    // ------------------------------------------------------------------

    public function formatRequest(TrainingRequest $request): array
    {
        return [
            'id' => $request->id,
            'status' => $request->status,
            'goal_type' => $request->goal_type,
            'notes' => $request->notes,
            'created_at' => $request->created_at?->toIso8601String(),
            'matched_at' => $request->matched_at?->toIso8601String(),
        ];
    }

    public function formatTrainer(User $trainer): array
    {
        return [
            'id' => $trainer->id,
            'name' => $trainer->name,
            'specialization' => $trainer->specialization,
            'bio' => $trainer->bio,
            'rating' => $trainer->averageRating(),
        ];
    }

    public function formatAssignment(TrainerAssignment $assignment): array
    {
        return [
            'id' => $assignment->id,
            'status' => $assignment->status,
            'confirmed' => $assignment->isConfirmed(),
            'confirmed_at' => $assignment->confirmed_at?->toIso8601String(),
            'started_at' => $assignment->started_at?->toIso8601String(),
            'assigned_by' => $assignment->assigned_by,
        ];
    }

    public function formatSchedule($schedule): array
    {
        return [
            'id' => $schedule->id,
            'day_of_week' => (int) $schedule->day_of_week,
            'day_name' => $schedule->dayName(),
            'time_slot' => $schedule->time_slot,
            'focus' => $schedule->focus,
            'notes' => $schedule->notes,
            'proposed_by' => $schedule->proposed_by,
            'confirmed_at' => $schedule->confirmed_at?->toIso8601String(),
            'member_response' => $schedule->member_response,
            'awaiting_member' => $schedule->awaitsMemberResponse(),
        ];
    }

    public function formatFeedback(TrainerFeedback $feedback): array
    {
        return [
            'id' => $feedback->id,
            'kind' => $feedback->kind,
            'message' => $feedback->message,
            'rating' => $feedback->rating !== null ? (int) $feedback->rating : null,
            'trainer_name' => $feedback->trainer?->name,
            'workout_session_id' => $feedback->workout_session_id,
            'read_at' => $feedback->read_at?->toIso8601String(),
            'created_at' => $feedback->created_at?->toIso8601String(),
        ];
    }

    private function formatClientRow(TrainerAssignment $assignment): array
    {
        $member = $assignment->user;

        return [
            'assignment_id' => $assignment->id,
            'user_id' => $member?->id,
            'name' => $member?->name,
            'email' => $member?->email,
            'primary_goal' => $member?->profile?->primary_goal,
            'experience_level' => $member?->profile?->experience_level,
            'confirmed' => $assignment->isConfirmed(),
            'started_at' => $assignment->started_at?->toIso8601String(),
            'schedule_days' => $assignment->schedules->count(),
            'workouts_30d' => WorkoutSession::where('user_id', $member?->id)
                ->where('started_at', '>=', now()->subDays(30))->count(),
            'last_session_at' => WorkoutSession::where('user_id', $member?->id)
                ->whereNotNull('finished_at')->latest('finished_at')->value('finished_at'),
            'is_training_now' => WorkoutSession::where('user_id', $member?->id)
                ->whereNull('finished_at')->exists(),
        ];
    }

    /** Sets + volume for one session, computed from its loaded relations. */
    private function sessionTotals(WorkoutSession $session): array
    {
        $sets = $session->workoutExercises->flatMap->sets;

        $volume = $sets->sum(function ($set) {
            if ($set->weight_kg === null || $set->reps === null) {
                return 0;
            }

            return (float) $set->weight_kg * (int) $set->reps;
        });

        return [
            'sets' => $sets->count(),
            'exercises' => $session->workoutExercises->count(),
            'volume_kg' => round((float) $volume, 2),
        ];
    }

    /**
     * A member's open session across the whole member base — used by the
     * trainer dashboard to show "who is training right now".
     *
     * @param  Collection<int, int>  $memberIds
     * @return array<int, array<string, mixed>>
     */
    public function liveSessionsAmong(Collection $memberIds): array
    {
        if ($memberIds->isEmpty()) {
            return [];
        }

        return WorkoutSession::whereIn('user_id', $memberIds)
            ->whereNull('finished_at')
            ->with(['user', 'workoutExercises.sets'])
            ->get()
            ->map(fn (WorkoutSession $s) => [
                'user_id' => $s->user_id,
                'user_name' => $s->user?->name,
                'session_id' => $s->id,
                'started_at' => $s->started_at?->toIso8601String(),
                'elapsed_minutes' => $s->started_at !== null
                    ? (int) $s->started_at->diffInMinutes(now()) : 0,
                'sets_logged' => $s->workoutExercises->flatMap->sets->count(),
            ])
            ->values()
            ->all();
    }
}
