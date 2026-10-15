<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The photo that proves a set was actually performed.
 *
 * A set cannot be completed without one, which is what separates this training
 * log from a checklist. The AI fields record what the vision model concluded:
 * not just "is this a photo" but "is this a photo of the exercise being
 * claimed". A member photographing their lunch must not be able to close out
 * leg day.
 */
class WorkoutSetPhoto extends Model
{
    /** The image plausibly shows the claimed exercise. */
    public const VERDICT_PLAUSIBLE = 'plausible';

    /** An image was supplied but could not be tied to the exercise. */
    public const VERDICT_UNCLEAR = 'unclear';

    /** The image clearly is not gym equipment or a training scene. */
    public const VERDICT_REJECTED = 'rejected';

    protected $fillable = [
        'workout_set_id',
        'user_id',
        'path',
        'mime',
        'size_bytes',
        'ai_analysis',
        'ai_verdict',
        'unverified',
        'ai_confidence',
        'trainer_note',
        'reviewed_at',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
        'ai_confidence' => 'float',
        'unverified' => 'boolean',
        'reviewed_at' => 'datetime',
    ];

    public function workoutSet(): BelongsTo
    {
        return $this->belongsTo(WorkoutSet::class, 'workout_set_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Whether this photo is acceptable evidence for the claimed set. */
    public function isAccepted(): bool
    {
        // Rejected is a hard no. Plausible and unclear are both accepted: a
        // blurry but genuine gym photo should not block a real workout, and the
        // trainer can still see the verdict and follow up. Only a clear
        // mismatch (which is what `rejected` means) is refused.
        return $this->ai_verdict !== self::VERDICT_REJECTED;
    }

    /**
     * Whether no check could be performed.
     *
     * True when every vision endpoint was down. The set counts as complete so a
     * member is not blocked by an outage, but the photo carries no verification
     * and the trainer's review surfaces it as such.
     */
    public function wasUnverified(): bool
    {
        return (bool) $this->unverified;
    }

    /** Whether the trainer has looked at this one. */
    public function isReviewed(): bool
    {
        return $this->reviewed_at !== null;
    }
}
