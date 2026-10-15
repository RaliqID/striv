<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One delivered reminder.
 *
 * Exists so the same reminder cannot go out twice in a day, and so support can
 * answer "did we actually email this member?". The unique index on
 * (user, kind, channel, for_date) is the real guarantee; this model is how the
 * application reads and writes that log.
 */
class ReminderSend extends Model
{
    protected $fillable = [
        'user_id',
        'kind',
        'channel',
        'for_date',
        'sent_at',
        'status',
        'error',
    ];

    protected $casts = [
        'for_date' => 'date',
        'sent_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
