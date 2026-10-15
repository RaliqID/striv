<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A trainer's note to a client, optionally attached to a live session.
 *
 * `kind` separates a real-time coaching nudge during a workout from a general
 * remark, so the client UI can present them differently without guessing from
 * whether a session id happens to be present.
 */
class TrainerFeedback extends Model
{
    use HasFactory;

    /** Live coaching note attached to a session in progress. */
    public const KIND_LIVE = 'live';

    /** General remark on the coaching relationship. */
    public const KIND_NOTE = 'note';

    protected $fillable = [
        'trainer_id',
        'user_id',
        'workout_session_id',
        'message',
        'kind',
        'rating',
        'read_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
        'rating' => 'integer',
    ];

    /** Whether this entry is a member's rating of their trainer. */
    public function isRating(): bool
    {
        return $this->rating !== null;
    }

    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function workoutSession(): BelongsTo
    {
        return $this->belongsTo(WorkoutSession::class);
    }
}
