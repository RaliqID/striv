<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Goal extends Model
{
    use HasFactory;

    /**
     * Goal types that measure a value improving over time, and therefore need
     * a target strictly above the starting baseline to be meaningful.
     */
    public const MEASURABLE_TYPES = ['weight', 'one_rm', 'reps', 'workouts'];

    /**
     * Types that are scoped to a single exercise. A "workouts" goal counts
     * sessions, so it has no exercise.
     */
    public const EXERCISE_TYPES = ['weight', 'one_rm', 'reps'];

    protected $fillable = [
        'user_id',
        'exercise_id',
        'target_type',
        'target_value',
        'starting_value',
        'target_reps',
        'deadline',
        'completed_at',
        'status',
    ];

    protected $casts = [
        // float, NOT decimal:2 — decimal serializes to string and crashes
        // frontend .toFixed() calls (see Profile weight_kg bug).
        'target_value' => 'float',
        'starting_value' => 'float',
        'target_reps' => 'integer',
        'deadline' => 'date',
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }

    public function progress(): HasMany
    {
        return $this->hasMany(GoalProgress::class);
    }

    /** Whether this goal type is measured against a single exercise. */
    public function isExerciseScoped(): bool
    {
        return in_array($this->target_type, self::EXERCISE_TYPES, true);
    }

    /** Unit label for the goal's values, used by the API and the UI. */
    public function unit(): string
    {
        return match ($this->target_type) {
            'weight', 'one_rm' => 'kg',
            'reps' => 'reps',
            'workouts' => 'workouts',
            default => '',
        };
    }

    /**
     * The improvement required, in the goal's own units.
     */
    public function requiredDelta(): float
    {
        return (float) $this->target_value - (float) ($this->starting_value ?? 0);
    }
}
