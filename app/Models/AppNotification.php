<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single in-app notification.
 *
 * Read state is a timestamp rather than a boolean so "read 3 minutes ago" is
 * available without another column, and so the unread query is a simple
 * `read_at IS NULL` that the composite index covers.
 */
class AppNotification extends Model
{
    use HasFactory;

    public const TYPE_TRAINER_ASSIGNED = 'trainer_assigned';
    public const TYPE_SCHEDULE_PROPOSED = 'schedule_proposed';
    public const TYPE_SCHEDULE_CONFIRMED = 'schedule_confirmed';
    public const TYPE_CLIENT_WAITING = 'client_waiting';
    public const TYPE_CLIENT_ASSIGNED = 'client_assigned';
    public const TYPE_FEEDBACK_RECEIVED = 'feedback_received';
    public const TYPE_LIVE_NOTE = 'live_note';
    public const TYPE_TRAINER_RELEASED = 'trainer_released';
    public const TYPE_RATING_RECEIVED = 'rating_received';

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'body',
        'action_url',
        'subject_type',
        'subject_id',
        'read_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isUnread(): bool
    {
        return $this->read_at === null;
    }

    public function markRead(): void
    {
        if ($this->isUnread()) {
            $this->forceFill(['read_at' => now()])->save();
        }
    }
}
