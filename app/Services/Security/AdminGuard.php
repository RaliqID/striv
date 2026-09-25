<?php

namespace App\Services\Security;

use App\Models\User;

/**
 * The invariants that stop an admin panel from sawing off the branch it sits on.
 *
 * These rules are shared by several endpoints (suspend, demote, delete), so
 * they live in one place instead of being re-implemented — and drifting — per
 * controller:
 *
 *   1. You cannot act destructively on your own account.
 *   2. You cannot remove the last remaining administrator.
 *
 * Rule 2 is the one that actually matters. Demoting or deleting the only admin
 * produces a system nobody can administer, and it is unrecoverable through the
 * UI, so it is refused rather than warned about.
 */
class AdminGuard
{
    /**
     * Returns an error message when the action must be refused, null when it may proceed.
     *
     * @param  string  $action  Human-readable description used in the message.
     */
    public function checkDestructive(User $actor, User $target, string $action): ?string
    {
        if ($actor->is($target)) {
            return "You cannot {$action} your own account.";
        }

        if ($this->wouldRemoveLastAdmin($target)) {
            return 'This is the only remaining administrator. Promote another admin first.';
        }

        return null;
    }

    /**
     * Whether acting on this user would leave the system without an admin.
     *
     * Only relevant for accounts that are currently admins. Active (non
     * suspended) admins are counted, since a suspended admin cannot log in to
     * administer anything.
     */
    public function wouldRemoveLastAdmin(User $target): bool
    {
        if (! $target->is_admin) {
            return false;
        }

        return User::where('is_admin', true)
            ->where('is_suspended', false)
            ->whereKeyNot($target->id)
            ->doesntExist();
    }

    /** True when this account is the only active administrator. */
    public function isLastAdmin(User $target): bool
    {
        return $target->is_admin && $this->wouldRemoveLastAdmin($target);
    }
}
