<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line in a member's XP ledger.
 *
 * The ledger is what makes the number auditable. Without it, "why am I only
 * Level 4" has no answer; with it, the member can be shown every award and the
 * day it was granted.
 */
class XpEvent extends Model
{
    use HasFactory;

    /**
     * Every source the system can award.
     *
     * Kept as constants so the award sites and the display layer cannot drift
     * apart on spelling — a typo in a source string would otherwise silently
     * create a new, unlabbelled category.
     */
    public const SOURCE_WORKOUT_COMPLETED = 'workout_completed';
    public const SOURCE_PROVEN_SET = 'proven_set';
    public const SOURCE_PR_SET = 'pr_set';
    public const SOURCE_SCHEDULE_KEPT = 'schedule_kept';
    public const SOURCE_STREAK_WEEK = 'streak_week';
    public const SOURCE_ACHIEVEMENT = 'achievement';
    public const SOURCE_SESSION_MISSED = 'session_missed';

    protected $fillable = [
        'user_id',
        'source',
        'amount',
        'label',
        'subject_type',
        'subject_id',
        'dedupe_key',
    ];

    protected $casts = [
        'amount' => 'integer',
        'subject_id' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Whether this event added or removed XP. */
    public function isPenalty(): bool
    {
        return $this->amount < 0;
    }
}
