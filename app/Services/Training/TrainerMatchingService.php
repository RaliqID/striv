<?php

namespace App\Services\Training;

use App\Models\TrainerAssignment;
use App\Models\TrainingRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Pairs a member with a personal trainer, automatically.
 *
 * The system is fully automatic by design: a member signs up, a request is
 * created, and a trainer is assigned without anyone clicking "approve". What
 * makes that safe rather than reckless is the choice of trainer — the member
 * is not dropped into a queue or handed to whoever is first, but matched to
 * the trainer best able to take them, measured on three things:
 *
 *   1. Availability   — an unavailable trainer is never selected.
 *   2. Headroom       — a trainer at capacity is skipped, so nobody is
 *                       quietly over-subscribed into poor service.
 *   3. Workload       — among the eligible, the least-loaded wins, which
 *                       spreads members evenly and keeps coaching quality
 *                       consistent as the user base grows.
 *
 * Goal specialisation is used as a preference, not a requirement: a member
 * whose goal matches a trainer's specialisation scores ahead of one who does
 * not, but a beginner asking for strength work is still better served by an
 * available generalist today than by nobody at all.
 */
class TrainerMatchingService
{
    public function __construct(
        private readonly TrainingNotifier $notifier,
        private readonly ProgramGenerator $generator,
    ) {
    }

    /**
     * Create the request that represents "this member wants a coach".
     *
     * Idempotent: a member has at most one open request, so signing up twice
     * (or a retried call) cannot produce duplicate demand for the same person.
     *
     * An existing open request has its goal refreshed rather than being left
     * alone. The request is created at signup — before onboarding has asked
     * for a goal — so without this the goal would stay NULL forever, and the
     * matcher would fall back to pure workload ordering instead of preferring
     * the specialist who actually fits.
     */
    public function requestFor(User $user, ?string $goalType = null, ?string $notes = null): TrainingRequest
    {
        $existing = $user->trainingRequests()
            ->whereIn('status', TrainingRequest::OPEN_STATUSES)
            ->latest('id')
            ->first();

        if ($existing !== null) {
            $updates = [];

            if ($goalType !== null && $goalType !== '' && $existing->goal_type !== $goalType) {
                $updates['goal_type'] = $goalType;
            }

            // Notes fill in when the member has now supplied them; an existing
            // note is never overwritten by a later empty value.
            if (($notes !== null && $notes !== '') && $existing->notes === null) {
                $updates['notes'] = $notes;
            }

            // A request created before onboarding has no goal at all — adopt
            // the profile's, so an abandoned onboarding still shows the
            // member's intent to whoever picks it up in the admin queue.
            if (! isset($updates['goal_type']) && $existing->goal_type === null) {
                $profileGoal = $user->profile?->primary_goal;
                if ($profileGoal !== null && $profileGoal !== '') {
                    $updates['goal_type'] = $profileGoal;
                }
            }

            if ($updates !== []) {
                $existing->forceFill($updates)->save();
            }

            return $existing;
        }

        return TrainingRequest::create([
            'user_id' => $user->id,
            'status' => TrainingRequest::STATUS_PENDING,
            'goal_type' => $goalType ?? $user->profile?->primary_goal,
            'notes' => $notes,
        ]);
    }

    /**
     * Run the matching pass for one request.
     *
     * Returns the assignment when a trainer was found, or null when none was
     * eligible. Null is a normal outcome, not an error: with no trainers on the
     * platform yet, the request simply stays pending and is picked up by the
     * next call once a trainer exists.
     */
    public function match(TrainingRequest $request): ?TrainerAssignment
    {
        // Already matched — never double-assign.
        if ($request->assignment()->exists()) {
            return $request->assignment;
        }

        $trainer = $this->selectTrainer($request);

        if ($trainer === null) {
            Log::info('TrainerMatchingService: no eligible trainer', [
                'request_id' => $request->id,
                'goal_type' => $request->goal_type,
            ]);

            return null;
        }

        $assignment = DB::transaction(function () use ($request, $trainer) {
            $assignment = TrainerAssignment::create([
                'trainer_id' => $trainer->id,
                'user_id' => $request->user_id,
                'training_request_id' => $request->id,
                'status' => TrainerAssignment::STATUS_ACTIVE,
                'assigned_by' => 'auto',
                'started_at' => now(),
            ]);

            $request->forceFill([
                'status' => TrainingRequest::STATUS_MATCHED,
                'matched_at' => now(),
            ])->save();

            return $assignment;
        });

        // Outside the transaction: a notification failure must not roll back a
        // match that is already correct.
        $assignment->load('trainer', 'user');
        $this->notifier->trainerAssigned($assignment);

        /*
         * Build the starting programme immediately.
         *
         * The member was matched precisely because they do not know which
         * exercises or loads to use — handing them an empty programme would
         * leave that gap open until the trainer finds time to write one. So a
         * plan is generated from their onboarding answers right now, and the
         * trainer's job becomes reviewing and adjusting it.
         *
         * Wrapped because a generation failure must not un-match a member who
         * already has a trainer: they would be left with neither a coach nor a
         * plan, which is worse than a coach with a plan still being written.
         */
        try {
            $this->generator->generateFor($assignment);
        } catch (\Throwable $e) {
            Log::error('ProgramGenerator failed during matching', [
                'assignment_id' => $assignment->id,
                'error' => $e->getMessage(),
            ]);
        }

        return $assignment;
    }

    /**
     * Convenience: create-or-reuse the request, then match it.
     *
     * This is what the signup path calls — one method, so the controller does
     * not have to know the two-step shape.
     */
    public function requestAndMatch(User $user, ?string $goalType = null, ?string $notes = null): TrainingRequest
    {
        $request = $this->requestFor($user, $goalType, $notes);

        if ($request->isOpen()) {
            $this->match($request);
            $request->refresh();
        }

        return $request;
    }

    /**
     * Pick the best trainer for a request.
     *
     * Ordering, applied as one query rather than several round trips:
     *
     *   1. fewest active clients — workload is the PRIMARY sort. A trainer at
     *      the load limit must lose to an idle one, even if they specialise in
     *      the member's goal; otherwise every member asking for "muscle" piles
     *      onto the muscle coach while the others sit idle.
     *   2. specialisation match — breaks ties between equally-loaded trainers,
     *      so a member asking for strength still prefers the strength coach
     *      when both that coach and a generalist are equally free.
     *   3. lowest id — stable, deterministic tie-break so the same request
     *      always resolves to the same trainer.
     *
     * Capacity is enforced as a hard filter, not a preference: a trainer at
     * capacity is excluded from the result set entirely.
     */
    public function selectTrainer(TrainingRequest $request): ?User
    {
        $activeCount = fn (): \Illuminate\Database\Eloquent\Builder => TrainerAssignment::query()
            ->selectRaw('count(*)')
            ->whereColumn('trainer_assignments.trainer_id', 'users.id')
            ->where('status', TrainerAssignment::STATUS_ACTIVE);

        $goal = $request->goal_type;

        /*
         * The capacity filter is a raw correlated subquery, so its placeholder
         * ('active') must be merged into the main query's bindings explicitly.
         * whereRaw() does NOT collect bindings for a subquery built elsewhere —
         * without this, the raw `?` silently swallows the NEXT binding
         * (`trainer`), the count subquery matches nothing, every trainer counts
         * as 0 clients, and capacity is never enforced. That failure is
         * invisible in the SQL text and only shows up as trainers being
         * over-subscribed.
         */
        $capacitySub = $activeCount();

        $query = User::query()
            ->select('users.*')
            ->selectSub($activeCount(), 'active_clients_count')
            ->where('users.role', User::ROLE_TRAINER)
            ->where('users.is_suspended', false)
            ->where('users.is_available', true)
            // Hard filter: at-capacity trainers are not candidates at all.
            ->whereRaw('('.$capacitySub->toSql().') < users.capacity', $capacitySub->getBindings());

        if ($goal !== null && $goal !== '') {
            $query->selectRaw('CASE WHEN users.specialization = ? THEN 0 ELSE 1 END AS spec_rank', [$goal]);
        }

        // Workload first, then specialisation, then a stable tie-break.
        $query->orderBy('active_clients_count');

        if ($goal !== null && $goal !== '') {
            $query->orderBy('spec_rank');
        }

        return $query
            ->orderBy('users.id')
            ->first();
    }

    /**
     * Re-run matching for every pending request.
     *
     * Called after a trainer is added or freed up, so members who were waiting
     * because nobody was eligible get matched without anyone re-submitting.
     *
     * @return int number of requests that found a trainer
     */
    public function matchPendingRequests(int $limit = 100): int
    {
        $matched = 0;

        TrainingRequest::where('status', TrainingRequest::STATUS_PENDING)
            ->orderBy('created_at')
            ->limit($limit)
            ->get()
            ->each(function (TrainingRequest $request) use (&$matched) {
                if ($this->match($request) !== null) {
                    $matched++;
                }
            });

        return $matched;
    }

    /**
     * End a coaching relationship and, if asked, immediately look for a
     * replacement.
     *
     * This is the exit that keeps the automatic system from becoming a trap. A
     * member whose trainer quits, or who does not gel with the first match, must
     * be able to get out — otherwise the only remaining option is to abandon
     * the account.
     *
     * The old assignment is ended rather than deleted so the coaching history
     * (schedules, feedback, prescribed routines) stays coherent and attributable
     * to whoever was actually responsible at the time.
     *
     * @return TrainerAssignment|null the new assignment when rematching succeeded
     */
    public function release(
        TrainerAssignment $assignment,
        string $reason,
        ?User $endedBy = null,
        bool $rematch = true,
    ): ?TrainerAssignment {
        if ($assignment->status !== TrainerAssignment::STATUS_ACTIVE) {
            // Already ended: nothing to do, and re-running must not corrupt
            // the recorded end time of the original handover.
            return null;
        }

        DB::transaction(function () use ($assignment, $reason, $endedBy, $rematch) {
            $assignment->forceFill([
                'status' => TrainerAssignment::STATUS_ENDED,
                'ended_at' => now(),
                'end_reason' => $reason,
                'ended_by_user_id' => $endedBy?->id,
                'rematch_requested_at' => $rematch ? now() : null,
            ])->save();

            // Free the member's queue slot so the next assignment is clean.
            // MATCHED means "was placed once"; sending it back to pending is
            // what allows a fresh match to be recorded against the same request.
            if ($rematch) {
                $request = $assignment->trainingRequest;
                if ($request !== null) {
                    $request->forceFill([
                        'status' => TrainingRequest::STATUS_PENDING,
                        'matched_at' => null,
                        'activated_at' => null,
                    ])->save();
                }
            }
        });

        if (! $rematch) {
            return null;
        }

        // Tell the member their coach is changing before announcing the new
        // one, so the two notifications read in the right order in their inbox.
        $this->notifier->trainerReleased($assignment->load('user'), null);

        $request = $assignment->trainingRequest()->first();

        return $request !== null ? $this->match($request) : null;
    }

    /**
     * Sweep up every member whose trainer left and who has not been re-matched.
     *
     * A manual release re-matches inline, but that can fail when no trainer is
     * free at that exact moment. This is the retry: run it when a trainer is
     * added or becomes available again, so those members are not stranded.
     *
     * @return int number of members successfully re-matched
     */
    public function rematchOrphans(int $limit = 100): int
    {
        $rematched = 0;

        TrainingRequest::where('status', TrainingRequest::STATUS_PENDING)
            ->whereHas('user.trainerAssignments', function ($q) {
                $q->where('status', TrainerAssignment::STATUS_ENDED)
                    ->whereNotNull('rematch_requested_at');
            })
            ->orderBy('created_at')
            ->limit($limit)
            ->get()
            ->each(function (TrainingRequest $request) use (&$rematched) {
                if ($this->match($request) !== null) {
                    $rematched++;
                }
            });

        return $rematched;
    }
}
