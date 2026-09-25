<?php

namespace App\Services\Security;

use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Single write path for the admin audit trail.
 *
 * Every privileged mutation goes through here so that "was this recorded?" is
 * answered in one place rather than depending on each controller remembering.
 */
class AuditLogger
{
    /**
     * Record a privileged action.
     *
     * @param  string  $action  Machine-readable verb, e.g. `user.suspended`.
     * @param  User  $actor  The admin performing the action.
     * @param  Model|null  $target  The affected record, when there is one.
     * @param  array<string, mixed>  $metadata  Extra context worth keeping.
     */
    public function log(
        string $action,
        User $actor,
        ?Model $target = null,
        array $metadata = [],
        ?Request $request = null,
    ): AdminAuditLog {
        return AdminAuditLog::create([
            'actor_id' => $actor->id,
            'actor_name' => (string) $actor->name,
            'target_user_id' => $target instanceof User ? $target->id : null,
            'target_label' => $this->labelFor($target),
            'action' => $action,
            'metadata' => $metadata === [] ? null : $metadata,
            'ip_address' => $request?->ip(),
        ]);
    }

    private function labelFor(?Model $target): ?string
    {
        if ($target === null) {
            return null;
        }

        // Users are labelled by email (stable, unique, recognisable in a log).
        if ($target instanceof User) {
            return (string) $target->email;
        }

        return class_basename($target).'#'.$target->getKey();
    }
}
