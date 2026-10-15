<?php

namespace App\Services\Training;

use App\Models\AppNotification;
use App\Models\TrainerAssignment;
use App\Models\TrainingRequest;
use App\Models\User;

/**
 * Writes in-app notifications for the training workflow.
 *
 * Every automatic step in the matching and coaching flow routes through here,
 * so the wording and routing for a given event live in exactly one place. The
 * alternative — building notification payloads inline in each controller —
 * drifts quickly once the same event fires from two code paths (e.g. a trainer
 * assignment made by the matcher and by an admin override).
 */
class TrainingNotifier
{
    /** Tell a member that a trainer has been assigned to them. */
    public function trainerAssigned(TrainerAssignment $assignment): void
    {
        $trainer = $assignment->trainer;

        $this->push($assignment->user_id, [
            'type' => AppNotification::TYPE_TRAINER_ASSIGNED,
            'title' => __('messages.notify.trainer_assigned_title'),
            'body' => __('messages.notify.trainer_assigned_body', [
                'name' => $trainer?->name ?? __('messages.training.trainer_assigned'),
            ]),
            'action_url' => '/my-trainer',
            'subject' => $assignment,
        ]);

        // The trainer also needs to know a client landed on their list.
        if ($trainer !== null) {
            $this->push($trainer->id, [
                'type' => AppNotification::TYPE_CLIENT_ASSIGNED,
                'title' => __('messages.notify.client_assigned_title'),
                'body' => __('messages.notify.client_assigned_body', [
                    'name' => $assignment->user?->name ?? '—',
                ]),
                'action_url' => '/trainer/clients/'.$assignment->user_id,
                'subject' => $assignment,
            ]);
        }
    }

    /** Tell a member their trainer proposed a schedule. */
    public function scheduleProposed(TrainerAssignment $assignment, int $slotCount): void
    {
        $this->push($assignment->user_id, [
            'type' => AppNotification::TYPE_SCHEDULE_PROPOSED,
            'title' => __('messages.notify.schedule_proposed_title'),
            'body' => __('messages.notify.schedule_proposed_body', [
                'name' => $assignment->trainer?->name ?? '—',
                'count' => $slotCount,
            ]),
            'action_url' => '/my-trainer',
            'subject' => $assignment,
        ]);
    }

    /** Tell a trainer the member accepted the schedule. */
    public function scheduleConfirmed(TrainerAssignment $assignment): void
    {
        $this->push($assignment->trainer_id, [
            'type' => AppNotification::TYPE_SCHEDULE_CONFIRMED,
            'title' => __('messages.notify.schedule_confirmed_title'),
            'body' => __('messages.notify.schedule_confirmed_body', [
                'name' => $assignment->user?->name ?? '—',
            ]),
            'action_url' => '/trainer/clients/'.$assignment->user_id,
            'subject' => $assignment,
        ]);
    }

    /** Tell a trainer a member is waiting and unassigned. */
    public function clientWaiting(TrainingRequest $request): void
    {
        // Broadcast to every available trainer: this is the "somebody needs a
        // coach and nobody owns them yet" signal.
        User::where('role', User::ROLE_TRAINER)
            ->where('is_available', true)
            ->where('is_suspended', false)
            ->pluck('id')
            ->each(function (int $trainerId) use ($request) {
                $this->push($trainerId, [
                    'type' => AppNotification::TYPE_CLIENT_WAITING,
                    'title' => __('messages.notify.client_waiting_title'),
                    'body' => $request->goal_type
                        ? __('messages.notify.client_waiting_body_goal', [
                            'name' => $request->user?->name ?? '—',
                            'goal' => $request->goal_type,
                        ])
                        : __('messages.notify.client_waiting_body', [
                            'name' => $request->user?->name ?? '—',
                        ]),
                    'action_url' => '/trainer',
                    'subject' => $request,
                ]);
            });
    }

    /** Tell a member their trainer released them and we are re-matching. */
    public function trainerReleased(TrainerAssignment $assignment, ?string $reason): void
    {
        $this->push($assignment->user_id, [
            'type' => AppNotification::TYPE_TRAINER_RELEASED,
            'title' => __('messages.notify.released_title'),
            // An explicit reason wins (an admin typed it); otherwise fall back
            // to the generic "we are finding you a new one" copy.
            'body' => $reason !== null && $reason !== ''
                ? $reason
                : __('messages.notify.released_body'),
            'action_url' => '/my-trainer',
            'subject' => $assignment,
        ]);
    }

    /** Tell a member they received coaching feedback. */
    public function feedbackReceived(User $member, User $trainer, ?int $sessionId, bool $isLive): void
    {
        $this->push($member->id, [
            'type' => $isLive
                ? AppNotification::TYPE_LIVE_NOTE
                : AppNotification::TYPE_FEEDBACK_RECEIVED,
            'title' => $isLive
                ? __('messages.notify.live_note_title')
                : __('messages.notify.feedback_title'),
            'body' => $sessionId !== null
                ? __('messages.notify.feedback_body_session', ['name' => $trainer->name])
                : __('messages.notify.feedback_body', ['name' => $trainer->name]),
            'action_url' => '/my-trainer',
            'subject_type' => 'workout_session',
            'subject_id' => $sessionId,
        ]);
    }

    /** Tell a trainer they were rated by a member. */
    public function ratingReceived(User $trainer, User $member, int $rating): void
    {
        $this->push($trainer->id, [
            'type' => AppNotification::TYPE_RATING_RECEIVED,
            'title' => __('messages.notify.rating_title'),
            'body' => __('messages.notify.rating_body', [
                'name' => $member->name,
                'rating' => $rating,
            ]),
            'action_url' => '/trainer/clients/'.$member->id,
        ]);
    }

    /**
     * @param  array{type: string, title: string, body?: string|null, action_url?: string|null, subject?: \Illuminate\Database\Eloquent\Model|null, subject_type?: string|null, subject_id?: int|null}  $payload
     */
    private function push(int $userId, array $payload): void
    {
        $subject = $payload['subject'] ?? null;

        AppNotification::create([
            'user_id' => $userId,
            'type' => $payload['type'],
            'title' => $payload['title'],
            'body' => $payload['body'] ?? null,
            'action_url' => $payload['action_url'] ?? null,
            'subject_type' => $payload['subject_type'] ?? ($subject !== null ? $subject->getMorphClass() : null),
            'subject_id' => $payload['subject_id'] ?? $subject?->getKey(),
        ]);
    }
}
