<?php

namespace App\Http\Controllers;

use App\Models\TrainerFeedback;
use App\Models\TrainerSchedule;
use App\Services\Training\TrainerMatchingService;
use App\Services\Training\TrainingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The member's side of the trainer relationship.
 *
 * Read endpoints are the primary surface: a member does not manage their
 * trainer, they are matched with one. The only writes here are the ones a
 * member legitimately owns — proposing a schedule slot, accepting or declining
 * what the trainer proposed, releasing a trainer they no longer want, and
 * rating the coaching they received.
 */
class MyTrainerController extends Controller
{
    public function __construct(
        private readonly TrainingService $training,
        private readonly TrainerMatchingService $matching,
    ) {
    }

    /**
     * Everything the "My Trainer" screen renders, in one request.
     *
     * Deliberately a single endpoint rather than four: the screen needs the
     * request state, the trainer, the schedule and the programme together, and
     * splitting them would make the UI render in visible stages.
     */
    public function show(Request $request)
    {
        return response()->json($this->training->memberOverview($request->user()));
    }

    /**
     * Ask for a trainer (or retry matching after a release).
     *
     * The member does not choose a trainer — they state their goal, and the
     * matcher picks. This is the manual re-entry point for someone who landed
     * in the "no trainer available" state.
     */
    public function request(Request $request)
    {
        $validated = $request->validate([
            'goal_type' => ['nullable', 'string', 'in:muscle,strength,endurance'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();

        $trainingRequest = $this->matching->requestAndMatch(
            $user,
            $validated['goal_type'] ?? null,
            $validated['notes'] ?? null,
        );

        return response()->json([
            'overview' => $this->training->memberOverview($user),
            'message' => $trainingRequest->status === 'matched'
                ? __('messages.training.trainer_assigned')
                : __('messages.training.request_queued'),
        ]);
    }

    /**
     * Propose a training slot the trainer did not offer.
     *
     * The schedule is a two-way agreement: a plan the member had no say in is
     * one they will not follow, so they can put a slot forward themselves.
     */
    public function proposeSchedule(Request $request)
    {
        $validated = $request->validate([
            'day_of_week' => ['required', 'integer', 'min:1', 'max:7'],
            'time_slot' => ['required', 'string', 'max:60'],
            'focus' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $assignment = $this->activeAssignment($request);

        if ($assignment === null) {
            return response()->json(['message' => __('messages.training.no_active_trainer')], 404);
        }

        $schedule = TrainerSchedule::create([
            'trainer_assignment_id' => $assignment->id,
            'day_of_week' => $validated['day_of_week'],
            'time_slot' => $validated['time_slot'],
            'focus' => $validated['focus'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'proposed_by' => 'member',
        ]);

        return response()->json([
            'schedule' => $this->training->formatSchedule($schedule),
            'message' => __('messages.training.slot_proposed'),
        ], 201);
    }

    /** Accept or decline a slot the trainer proposed. */
    public function respondToSchedule(Request $request, int $scheduleId)
    {
        $validated = $request->validate([
            'response' => ['required', 'string', 'in:accepted,declined'],
        ]);

        $assignment = $this->activeAssignment($request);

        if ($assignment === null) {
            return response()->json(['message' => __('messages.training.no_active_trainer')], 404);
        }

        // Scoped through the assignment so a member cannot respond to a slot
        // belonging to somebody else's coaching relationship.
        $schedule = TrainerSchedule::where('trainer_assignment_id', $assignment->id)
            ->findOrFail($scheduleId);

        /*
         * Three writes that must land together or not at all.
         *
         * Accepting a proposed slot changes three rows in one logical step:
         *
         *   1. the slot records the member's response
         *   2. the assignment becomes confirmed (the relationship is now live)
         *   3. the original training request is marked active
         *
         * Without a transaction, a failure between them leaves a state that is
         * visible and wrong: the member has accepted, the assignment says they
         * are confirmed, but the request still reads as pending — so the
         * trainer's side and the member's side disagree about whether coaching
         * has started. Retrying does not repair it either, because step 2 is
         * guarded by `! isConfirmed()` and would now be skipped, stranding the
         * request permanently.
         *
         * Wrapping the whole sequence means either the member's acceptance is
         * fully recorded or nothing changed and they can try again.
         */
        DB::transaction(function () use ($schedule, $assignment, $validated) {
            $schedule->forceFill([
                'member_response' => $validated['response'],
                'member_responded_at' => now(),
                // Accepting is also the confirmation the whole flow waits on.
                'confirmed_at' => $validated['response'] === 'accepted'
                    ? ($schedule->confirmed_at ?? now())
                    : null,
            ])->save();

            // Once anything is confirmed the relationship is live: the member is
            // no longer waiting to be scheduled.
            if ($validated['response'] === 'accepted' && ! $assignment->isConfirmed()) {
                $assignment->forceFill(['confirmed_at' => now()])->save();

                $assignment->trainingRequest?->forceFill([
                    'status' => \App\Models\TrainingRequest::STATUS_ACTIVE,
                    'activated_at' => now(),
                ])->save();
            }
        });

        return response()->json([
            'schedule' => $this->training->formatSchedule($schedule->refresh()),
            'overview' => $this->training->memberOverview($request->user()),
        ]);
    }

    /**
     * Release the current trainer and ask for a new one.
     *
     * The exit valve: without this, a member stuck with an unsuitable trainer
     * has no recourse inside the product.
     */
    public function release(Request $request)
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();
        $assignment = $this->activeAssignment($request);

        if ($assignment === null) {
            return response()->json(['message' => __('messages.training.no_active_trainer')], 404);
        }

        $new = $this->matching->release(
            $assignment,
            \App\Models\TrainerAssignment::END_REASON_RELEASED_BY_MEMBER,
            $user,
            true,
        );

        return response()->json([
            'overview' => $this->training->memberOverview($user->refresh()),
            'rematched' => $new !== null,
            'message' => $new !== null
                ? __('messages.training.released_rematched')
                : __('messages.training.released_waiting'),
        ]);
    }

    /**
     * Rate the coaching received.
     *
     * Stored as a special TrainerFeedback row so it shares the same
     * author/recipient plumbing as ordinary feedback and automatically feeds
     * the trainer's average rating, which in turn informs matching.
     */
    public function rate(Request $request)
    {
        $validated = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        $user = $request->user();
        $assignment = $this->activeAssignment($request);

        if ($assignment === null) {
            return response()->json(['message' => __('messages.training.no_active_trainer')], 404);
        }

        $feedback = TrainerFeedback::create([
            'trainer_id' => $assignment->trainer_id,
            'user_id' => $user->id,
            'message' => $validated['message'] ?? '',
            'kind' => TrainerFeedback::KIND_NOTE,
            'rating' => $validated['rating'],
        ]);

        app(\App\Services\Training\TrainingNotifier::class)
            ->ratingReceived($assignment->trainer, $user, (int) $validated['rating']);

        return response()->json([
            'feedback' => $this->training->formatFeedback($feedback),
            'message' => __('messages.training.rating_thanks'),
        ], 201);
    }

    /** Mark a piece of trainer feedback as read. */
    public function markFeedbackRead(Request $request, int $feedbackId)
    {
        $feedback = TrainerFeedback::where('user_id', $request->user()->id)
            ->findOrFail($feedbackId);

        if ($feedback->read_at === null) {
            $feedback->forceFill(['read_at' => now()])->save();
        }

        return response()->json([
            'feedback' => $this->training->formatFeedback($feedback->refresh()),
        ]);
    }

    /** The member's currently active coaching relationship, if any. */
    private function activeAssignment(Request $request)
    {
        return $request->user()->trainerAssignments()
            ->where('status', \App\Models\TrainerAssignment::STATUS_ACTIVE)
            ->latest('id')
            ->first();
    }
}
