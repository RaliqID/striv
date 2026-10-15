<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class WorkoutSet extends Model
{
    use HasFactory;

    protected $fillable = [
        'workout_exercise_id',
        'set_number',
        'weight_kg',
        'reps',
        'rpe',
        'completed_at',
    ];

    protected $casts = [
        'weight_kg' => 'float',
        'reps' => 'integer',
        'rpe' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function workoutExercise(): BelongsTo
    {
        return $this->belongsTo(WorkoutExercise::class);
    }

    /** The photo that proves this set was performed. At most one. */
    public function photo(): HasOne
    {
        return $this->hasOne(WorkoutSetPhoto::class, 'workout_set_id');
    }

    /**
     * Whether this set is evidenced.
     *
     * A set is only "done" when a photo exists AND that photo was not rejected.
     * Checking the relation rather than trusting `completed_at` alone means a
     * photo deleted after the fact correctly un-completes the set.
     */
    public function isProven(): bool
    {
        return $this->completed_at !== null
            && $this->photo !== null
            && $this->photo->isAccepted();
    }
}