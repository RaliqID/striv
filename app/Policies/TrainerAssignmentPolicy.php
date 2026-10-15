<?php

namespace App\Policies;

use App\Models\TrainerAssignment;
use App\Models\User;

/**
 * Who may see or act on a coaching relationship.
 *
 * The rule that matters is the negative one: a trainer must not be able to
 * reach a member who is not on their client list. Client data includes live
 * workout sessions and personal profile fields, so an over-broad read here is
 * a privacy leak, not a cosmetic bug.
 *
 * Admins are allowed everywhere — they are the escalation path when a trainer
 * leaves or a relationship needs repair.
 */
class TrainerAssignmentPolicy
{
    /** Admins see everything; participants see their own relationship. */
    public function view(User $actor, TrainerAssignment $assignment): bool
    {
        return $actor->isAdmin()
            || $actor->id === $assignment->trainer_id
            || $actor->id === $assignment->user_id;
    }

    /** Only the assigned trainer (or an admin) writes coaching content. */
    public function manage(User $actor, TrainerAssignment $assignment): bool
    {
        return $actor->isAdmin() || $actor->id === $assignment->trainer_id;
    }

    /**
     * Whether this trainer currently coaches this member.
     *
     * Used as the single gate for every client-scoped endpoint, so "can this
     * trainer see this member's live session" is answered in one place instead
     * of being re-derived per controller.
     */
    public function coaches(User $actor, User $member): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }

        if (! $actor->isTrainer()) {
            return false;
        }

        return TrainerAssignment::where('trainer_id', $actor->id)
            ->where('user_id', $member->id)
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->exists();
    }
}
