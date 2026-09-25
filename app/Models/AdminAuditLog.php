<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable record of a privileged action.
 *
 * Deliberately stores the actor's name and the target's label as denormalised
 * strings alongside the ids. An audit trail that disappears when a user row is
 * deleted is not an audit trail — the ids are there for linking, the strings
 * are there so the history still reads correctly afterwards.
 */
#[Fillable([
    'actor_id', 'actor_name', 'target_user_id', 'target_label',
    'action', 'metadata', 'ip_address',
])]
class AdminAuditLog extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
