<?php

namespace App\Http\Controllers;

use App\Models\Routine;
use App\Models\RoutineExercise;
use App\Models\TrainerAssignment;
use App\Models\TrainerFeedback;
use App\Models\TrainerSchedule;
use App\Models\User;
use App\Services\Training\TrainingNotifier;
use App\Services\Training\TrainingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * The trainer's workspace.
 *
 * Every endpoint here is scoped to the actor's own clients through the
 * `coaches` gate on the policy. A trainer who guesses another trainer's member
 * id must get a 403, not a profile — the data reachable from here includes live
 * workout sessions and body metrics.
 */
class TrainerController extends Controller
{
    public function __construct(
        private readonly TrainingService $training,
        private readonly TrainingNotifier $notifier,
    ) {
    }

    /**
     * Trainer home: workload, clients, and who is training right now.
     *
     * The live list is computed in one query across all the trainer's clients
     * rather than per client, because this is the landing screen and it is
     * polled while a member trains.
     */
    public function dashboard(Request $request)
    {
        $trainer = $request->user();
        $clients = $this->training->trainerClientList($trainer);

        $memberIds = collect($clients)->pluck('user_id')->filter()->values();

        return response()->json([
            'trainer' => [
                'id' => $trainer->id,
                'name' => $trainer->name,
                'specialization' => $trainer->specialization,
                'capacity' => (int) $trainer->capacity,
                'is_available' => (bool) $trainer->is_available,
                'rating' => $trainer->averageRating(),
            ],
            'stats' => [
                'clients' => count($clients),
                'capacity' => (int) $trainer->capacity,
                'slots_free' => max(0, (int) $trainer->capacity - count($clients)),
                'awaiting_schedule' => collect($clients)->where('confirmed', false)->count(),
                'training_now' => count($this->training->liveSessionsAmong($memberIds)),
            ],
            'clients' => $clients,
            'live' => $this->training->liveSessionsAmong($memberIds),
        ]);
    }

    /** One client in full: profile, programme, history, live session. */
    public function client(Request $request, User $user)
    {
        $this->authorizeClient($request, $user);

        $detail = $this->training->clientDetail($request->user(), $user);

        if ($detail === null) {
            return response()->json(['message' => __('messages.training.not_coaching')], 404);
        }

        return response()->json($detail);
    }

    /**
     * The live feed for one client.
     *
     * Polled by the trainer's client screen while a workout is in progress. A
     * poll rather than a socket: it needs no extra service, survives the client
     * switching networks, and the data is already a cheap indexed lookup.
     */
    public function live(Request $request, User $user)
    {
        $this->authorizeClient($request, $user);

        return response()->json([
            'live_session' => $this->training->liveSession($user),
            'stats' => $this->training->clientStats($user),
        ]);
    }

    /** Post feedback, optionally attached to the live session. */
    public function storeFeedback(Request $request, User $user)
    {
        $this->authorizeClient($request, $user);

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'workout_session_id' => ['nullable', 'integer'],
            'kind' => ['nullable', 'string', 'in:live,note'],
        ]);

        $trainer = $request->user();

        $feedback = TrainerFeedback::create([
            'trainer_id' => $trainer->id,
            'user_id' => $user->id,
            'workout_session_id' => $validated['workout_session_id'] ?? null,
            'message' => $validated['message'],
            'kind' => $validated['kind'] ?? ($validated['workout_session_id'] ?? null
                ? TrainerFeedback::KIND_LIVE
                : TrainerFeedback::KIND_NOTE),
        ]);

        $this->notifier->feedbackReceived(
            $user,
            $trainer,
            $feedback->workout_session_id,
            $feedback->kind === TrainerFeedback::KIND_LIVE,
        );

        return response()->json([
            'feedback' => $this->training->formatFeedback($feedback->load('trainer')),
            'message' => __('messages.training.feedback_sent'),
        ], 201);
    }

    /**
     * Replace the proposed weekly schedule.
     *
     * Replace rather than patch: a schedule is a weekly shape, and editing it
     * slot-by-slot invites inconsistent states (two overlapping Tuesday
     * sessions). The client confirms the whole thing.
     */
    public function setSchedule(Request $request, User $user)
    {
        $this->authorizeClient($request, $user);

        $validated = $request->validate([
            'slots' => ['required', 'array', 'max:14'],
            'slots.*.day_of_week' => ['required', 'integer', 'min:1', 'max:7'],
            'slots.*.time_slot' => ['nullable', 'string', 'max:60'],
            'slots.*.focus' => ['nullable', 'string', 'max:120'],
            'slots.*.notes' => ['nullable', 'string', 'max:500'],
        ]);

        $assignment = $this->activeAssignmentOrFail($request->user(), $user);

        DB::transaction(function () use ($assignment, $validated) {
            $assignment->schedules()->delete();

            foreach ($validated['slots'] as $slot) {
                TrainerSchedule::create([
                    'trainer_assignment_id' => $assignment->id,
                    'day_of_week' => $slot['day_of_week'],
                    'time_slot' => $slot['time_slot'] ?? null,
                    'focus' => $slot['focus'] ?? null,
                    'notes' => $slot['notes'] ?? null,
                    'proposed_by' => 'trainer',
                    // A slot proposed by the trainer starts unconfirmed; the
                    // member's acceptance is what confirms it.
                    'confirmed_at' => null,
                    'member_response' => null,
                ]);
            }
        });

        $this->notifier->scheduleProposed($assignment, count($validated['slots']));

        return response()->json([
            'schedule' => $assignment->schedules()->get()
                ->map(fn ($s) => $this->training->formatSchedule($s))->values()->all(),
            'message' => __('messages.training.schedule_sent'),
        ]);
    }

    /**
     * Prescribe a training programme for this client.
     *
     * The trainer authors the plan, not the member — a beginner does not know
     * which movements or loads move them toward their goal, which is the whole
     * reason they were matched with a professional.
     */
    public function storeProgram(Request $request, User $user)
    {
        $this->authorizeClient($request, $user);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'est_duration_minutes' => ['nullable', 'integer', 'min:1', 'max:300'],
            'exercises' => ['required', 'array', 'min:1', 'max:30'],
            'exercises.*.exercise_id' => ['required', 'integer', 'exists:exercises,id'],
            'exercises.*.target_sets' => ['nullable', 'integer', 'min:1', 'max:20'],
            'exercises.*.target_reps' => ['nullable', 'integer', 'min:1', 'max:100'],
            'exercises.*.target_weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
        ]);

        $assignment = $this->activeAssignmentOrFail($request->user(), $user);

        $routine = DB::transaction(function () use ($assignment, $user, $validated) {
            $routine = Routine::create([
                'user_id' => $user->id,
                // The link that marks this as trainer-prescribed rather than
                // member-authored.
                'trainer_assignment_id' => $assignment->id,
                'name' => $validated['name'],
                'notes' => $validated['notes'] ?? null,
                'est_duration_minutes' => $validated['est_duration_minutes'] ?? null,
            ]);

            foreach (array_values($validated['exercises']) as $i => $ex) {
                RoutineExercise::create([
                    'routine_id' => $routine->id,
                    'exercise_id' => $ex['exercise_id'],
                    'order' => $i + 1,
                    'target_sets' => $ex['target_sets'] ?? null,
                    'target_reps' => $ex['target_reps'] ?? null,
                    'target_weight_kg' => $ex['target_weight_kg'] ?? null,
                ]);
            }

            return $routine;
        });

        return response()->json([
            'program' => $this->training->programFor($assignment->refresh()),
            'routine_id' => $routine->id,
            'message' => __('messages.training.program_assigned'),
        ], 201);
    }

    /** Remove a prescribed programme. */
    public function destroyProgram(Request $request, User $user, int $routineId)
    {
        $this->authorizeClient($request, $user);

        $assignment = $this->activeAssignmentOrFail($request->user(), $user);

        // Scoped to this assignment so a trainer cannot delete a member's own
        // self-authored routine, nor another trainer's prescription.
        $routine = Routine::where('trainer_assignment_id', $assignment->id)
            ->findOrFail($routineId);

        $routine->delete();

        return response()->json([
            'program' => $this->training->programFor($assignment->refresh()),
            'message' => __('messages.training.program_removed'),
        ]);
    }

    /** Toggle whether this trainer is accepting new clients. */
    public function setAvailability(Request $request)
    {
        $validated = $request->validate([
            'is_available' => ['required', 'boolean'],
        ]);

        $trainer = $request->user();
        $trainer->forceFill(['is_available' => (bool) $validated['is_available']])->save();

        return response()->json([
            'is_available' => (bool) $trainer->is_available,
            'message' => $trainer->is_available
                ? __('messages.training.availability_on')
                : __('messages.training.availability_off'),
        ]);
    }

    /** Update the trainer's own profile fields. */
    public function updateProfile(Request $request)
    {
        $validated = $request->validate([
            'specialization' => ['nullable', 'string', 'max:120'],
            'bio' => ['nullable', 'string', 'max:2000'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $trainer = $request->user();
        $trainer->forceFill(array_filter(
            $validated,
            fn ($v) => $v !== null,
        ))->save();

        return response()->json([
            'trainer' => [
                'id' => $trainer->id,
                'specialization' => $trainer->specialization,
                'bio' => $trainer->bio,
                'capacity' => (int) $trainer->capacity,
            ],
            'message' => __('messages.updated'),
        ]);
    }

    /** 403 unless the actor coaches this member. */
    private function authorizeClient(Request $request, User $user): void
    {
        if (! Gate::forUser($request->user())->allows('coaches', $user)) {
            abort(response()->json(['message' => __('messages.training.not_coaching')], 403));
        }
    }

    /** The active assignment between this trainer and this member, or 404. */
    private function activeAssignmentOrFail(User $trainer, User $member): TrainerAssignment
    {
        $assignment = TrainerAssignment::where('trainer_id', $trainer->id)
            ->where('user_id', $member->id)
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->first();

        if ($assignment === null) {
            abort(response()->json(['message' => __('messages.training.no_active_relationship')], 404));
        }

        return $assignment;
    }
}
