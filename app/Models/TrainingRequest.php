<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A member's request to be paired with a personal trainer.
 *
 * Created automatically at signup so the member never lands on an empty state.
 * The status lifecycle is:
 *
 *   pending   → created at signup, no trainer yet
 *   matched   → a trainer has been assigned (assignment row exists)
 *   active    → trainer confirmed the schedule and coaching is under way
 *   completed → programme finished
 *   rejected  → could not be matched (e.g. no trainer available)
 *
 * `goal_type` is the member's objective (muscle / strength / conditioning),
 * never a raw kg/reps target — a beginner does not know what numbers to aim
 * for, which is precisely why they are being matched with a professional.
 */
class TrainingRequest extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_MATCHED = 'matched';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_REJECTED = 'rejected';

    /** Statuses that mean the member is still waiting on a coach. */
    public const OPEN_STATUSES = [self::STATUS_PENDING, self::STATUS_MATCHED];

    protected $fillable = [
        'user_id',
        'status',
        'goal_type',
        'notes',
        'rejection_reason',
        'matched_at',
        'activated_at',
        'completed_at',
    ];

    protected $casts = [
        'matched_at' => 'datetime',
        'activated_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function assignment(): HasOne
    {
        return $this->hasOne(TrainerAssignment::class);
    }

    /** Whether this request is still awaiting or undergoing matching. */
    public function isOpen(): bool
    {
        return in_array($this->status, self::OPEN_STATUSES, true);
    }
}
