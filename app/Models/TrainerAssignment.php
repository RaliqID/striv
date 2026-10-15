<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The working relationship between a trainer and the member they coach.
 *
 * Kept separate from TrainingRequest because it outlives the request: the
 * request records "asked for a coach", the assignment records "this trainer is
 * responsible for this member". The trainer's client list and the member's
 * live monitoring feed are both driven from here.
 */
class TrainerAssignment extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_ENDED = 'ended';

    /** Why a coaching relationship ended. */
    public const END_REASON_RELEASED_BY_MEMBER = 'released_by_member';
    public const END_REASON_RELEASED_BY_TRAINER = 'released_by_trainer';
    public const END_REASON_REASSIGNED_BY_ADMIN = 'reassigned_by_admin';
    public const END_REASON_TRAINER_UNAVAILABLE = 'trainer_unavailable';
    public const END_REASON_PROGRAMME_COMPLETED = 'programme_completed';

    protected $fillable = [
        'trainer_id',
        'user_id',
        'training_request_id',
        'status',
        'confirmed_at',
        'assigned_by',
        'end_reason',
        'ended_by_user_id',
        'started_at',
        'ended_at',
        'rematch_requested_at',
    ];

    protected $casts = [
        'confirmed_at' => 'datetime',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'rematch_requested_at' => 'datetime',
    ];

    /** The trainer. */
    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    /** The member being coached. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function trainingRequest(): BelongsTo
    {
        return $this->belongsTo(TrainingRequest::class);
    }

    /** Who ended the relationship, when a person did. Null for system endings. */
    public function endedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ended_by_user_id');
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(TrainerSchedule::class)->orderBy('day_of_week');
    }

    /** True once the trainer has agreed the weekly schedule with the member. */
    public function isConfirmed(): bool
    {
        return $this->confirmed_at !== null;
    }

    /** Routines this trainer has prescribed for this member. */
    public function routines(): HasMany
    {
        return $this->hasMany(Routine::class, 'trainer_assignment_id');
    }

    /** Feedback notes exchanged under this coaching relationship. */
    public function feedback(): HasMany
    {
        return $this->hasMany(TrainerFeedback::class, 'trainer_id', 'trainer_id')
            ->where('user_id', $this->user_id);
    }

    /** True once a release has been recorded but no new trainer has matched yet. */
    public function awaitsRematch(): bool
    {
        return $this->status === self::STATUS_ENDED
            && $this->rematch_requested_at !== null;
    }
}
