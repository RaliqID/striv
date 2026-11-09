<?php

namespace App\Http\Controllers;

use App\Models\TrainerAssignment;
use App\Models\TrainingRequest;
use App\Models\User;
use App\Services\Security\AuditLogger;
use App\Services\Training\TrainerMatchingService;
use App\Services\Training\TrainingNotifier;
use App\Services\Training\TrainingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Administrator view of the training system.
 *
 * Admins are the escalation path, not the normal operator: matching is
 * automatic, so this controller exists for the exceptions — a member stranded
 * because every trainer is full, a trainer who has left, a mis-match that needs
 * a human decision.
 */
class AdminTrainerController extends Controller
{
    public function __construct(
        private readonly TrainingService $training,
        private readonly TrainerMatchingService $matching,
        private readonly TrainingNotifier $notifier,
        private readonly AuditLogger $audit,
    ) {
    }

    /** Overview: every trainer, their load, and unassigned demand. */
    public function index(Request $request)
    {
        $trainers = User::where('role', User::ROLE_TRAINER)
            ->withCount(['clientAssignments as active_clients_count' => function ($q) {
                $q->where('status', TrainerAssignment::STATUS_ACTIVE);
            }])
            ->orderBy('name')
            ->get()
            ->map(fn (User $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'email' => $t->email,
                'specialization' => $t->specialization,
                'capacity' => (int) $t->capacity,
                'active_clients' => (int) $t->active_clients_count,
                'slots_free' => max(0, (int) $t->capacity - (int) $t->active_clients_count),
                'is_available' => (bool) $t->is_available,
                'is_suspended' => (bool) $t->is_suspended,
                'rating' => $t->averageRating(),
            ]);

        return response()->json([
            'trainers' => $trainers,
            'stats' => [
                'trainers_total' => $trainers->count(),
                'trainers_available' => $trainers->where('is_available', true)->count(),
                'clients_active' => TrainerAssignment::where('status', TrainerAssignment::STATUS_ACTIVE)->count(),
                'capacity_total' => $trainers->sum('capacity'),
                'pending_requests' => TrainingRequest::where('status', TrainingRequest::STATUS_PENDING)->count(),
                'awaiting_schedule' => TrainerAssignment::where('status', TrainerAssignment::STATUS_ACTIVE)
                    ->whereNull('confirmed_at')->count(),
            ],
        ]);
    }

    /**
     * Members with no trainer, oldest first.
     *
     * This is the queue that should normally be empty. A growing list here means
     * capacity has run out and trainers need adding — which is exactly what an
     * admin needs to see.
     */
    public function pendingRequests()
    {
        $requests = TrainingRequest::where('status', TrainingRequest::STATUS_PENDING)
            ->with('user.profile')
            ->orderBy('created_at')
            ->limit(200)
            ->get()
            ->map(fn (TrainingRequest $r) => [
                'id' => $r->id,
                'user_id' => $r->user_id,
                'user_name' => $r->user?->name,
                'user_email' => $r->user?->email,
                'goal_type' => $r->goal_type,
                'notes' => $r->notes,
                'created_at' => $r->created_at?->toIso8601String(),
                'waiting_minutes' => $r->created_at !== null
                    ? (int) $r->created_at->diffInMinutes(now()) : null,
            ]);

        return response()->json(['requests' => $requests]);
    }

    /** Force a match sweep — used after adding trainers or freeing capacity. */
    public function rematch(Request $request)
    {
        $matched = $this->matching->matchPendingRequests(200);
        $rematched = $this->matching->rematchOrphans(200);

        $this->audit->log('training.rematch_run', $request->user(), null, [
            'matched' => $matched,
            'rematched_orphans' => $rematched,
        ], $request);

        return response()->json([
            'matched' => $matched,
            'rematched_orphans' => $rematched,
            'message' => ($matched + $rematched) > 0
                ? __('messages.training.rematch_done', ['count' => $matched + $rematched])
                : __('messages.training.rematch_none'),
        ]);
    }

    /**
     * Assign a specific trainer to a waiting member, overriding the matcher.
     *
     * The automatic path always runs first; this exists for the case where an
     * admin knows something the scorer does not (a language match, a cancelled
     * slot, a member re-requesting the trainer they had before).
     */
    public function assign(Request $request, int $requestId)
    {
        $validated = $request->validate([
            'trainer_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $trainingRequest = TrainingRequest::with('user')->findOrFail($requestId);

        $trainer = User::where('id', $validated['trainer_id'])
            ->where('role', User::ROLE_TRAINER)
            ->first();

        if ($trainer === null) {
            return response()->json(['message' => __('messages.training.not_a_trainer')], 422);
        }

        if ($trainingRequest->assignment()->exists()) {
            return response()->json(['message' => __('messages.training.already_has_trainer')], 422);
        }

        // An admin override may knowingly exceed capacity, but a suspension is
        // a hard stop — a suspended trainer cannot log in to coach anyone.
        if ($trainer->is_suspended) {
            return response()->json(['message' => __('messages.training.trainer_suspended')], 422);
        }

        $assignment = DB::transaction(function () use ($trainingRequest, $trainer) {
            $assignment = TrainerAssignment::create([
                'trainer_id' => $trainer->id,
                'user_id' => $trainingRequest->user_id,
                'training_request_id' => $trainingRequest->id,
                'status' => TrainerAssignment::STATUS_ACTIVE,
                'assigned_by' => 'manual',
                'started_at' => now(),
            ]);

            $trainingRequest->forceFill([
                'status' => TrainingRequest::STATUS_MATCHED,
                'matched_at' => now(),
            ])->save();

            return $assignment;
        });

        $this->notifier->trainerAssigned($assignment->load('trainer', 'user'));

        $this->audit->log('training.assigned_manually', $request->user(), $trainer, [
            'member_id' => $trainingRequest->user_id,
            'request_id' => $trainingRequest->id,
        ], $request);

        return response()->json([
            'message' => __('messages.training.assigned'),
            'overview' => $this->training->memberOverview($trainingRequest->user->refresh()),
        ]);
    }

    /**
     * Move a member from their current trainer to another one.
     *
     * Ends the old assignment (preserving history) and creates the new one in a
     * single transaction, so a member is never briefly trainer-less if the
     * second write fails.
     */
    public function reassign(Request $request, User $user)
    {
        $validated = $request->validate([
            'trainer_id' => ['required', 'integer', 'exists:users,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $newTrainer = User::where('id', $validated['trainer_id'])
            ->where('role', User::ROLE_TRAINER)
            ->first();

        if ($newTrainer === null) {
            return response()->json(['message' => __('messages.training.not_a_trainer')], 422);
        }

        $current = TrainerAssignment::where('user_id', $user->id)
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->first();

        if ($current !== null && $current->trainer_id === $newTrainer->id) {
            return response()->json(['message' => __('messages.training.already_coached_by')], 422);
        }

        DB::transaction(function () use ($current, $user, $newTrainer, $validated, $request) {
            if ($current !== null) {
                $current->forceFill([
                    'status' => TrainerAssignment::STATUS_ENDED,
                    'ended_at' => now(),
                    'end_reason' => TrainerAssignment::END_REASON_REASSIGNED_BY_ADMIN,
                    'ended_by_user_id' => $request->user()->id,
                ])->save();
            }

            TrainerAssignment::create([
                'trainer_id' => $newTrainer->id,
                'user_id' => $user->id,
                'training_request_id' => $current?->training_request_id,
                'status' => TrainerAssignment::STATUS_ACTIVE,
                'assigned_by' => 'manual',
                'started_at' => now(),
            ]);
        });

        $this->notifier->trainerReleased(
            $current ?? new TrainerAssignment(['user_id' => $user->id]),
            $validated['reason'] ?? 'An administrator assigned you a new trainer.',
        );

        $this->audit->log('training.reassigned', $request->user(), $user, [
            'from_trainer_id' => $current?->trainer_id,
            'to_trainer_id' => $newTrainer->id,
        ], $request);

        return response()->json([
            'message' => __('messages.training.reassigned'),
            'overview' => $this->training->memberOverview($user->refresh()),
        ]);
    }

    /** Promote a member to trainer, running the matcher for waiting members. */
    public function promote(Request $request, User $user)
    {
        $validated = $request->validate([
            'specialization' => ['nullable', 'string', 'in:muscle,strength,endurance'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        if ($user->isTrainer()) {
            return response()->json(['message' => __('messages.training.already_trainer')], 422);
        }

        $user->role = User::ROLE_TRAINER;
        $user->specialization = $validated['specialization'] ?? null;
        $user->bio = $validated['bio'] ?? null;
        $user->capacity = $validated['capacity'] ?? 25;
        $user->is_available = true;
        $user->save();

        // A new trainer means previously unmatchable members can now be placed.
        $matched = $this->matching->matchPendingRequests(200);

        $this->audit->log('training.promoted_to_trainer', $request->user(), $user, [
            'matched_waiting' => $matched,
        ], $request);

        return response()->json([
            'message' => $matched > 0
                ? __('messages.training.trainer_created_matched', ['count' => $matched])
                : __('messages.training.trainer_created'),
        ]);
    }
}
