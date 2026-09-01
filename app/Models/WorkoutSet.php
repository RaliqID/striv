<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkoutSet extends Model
{
    use HasFactory;

    protected $fillable = [
        'workout_exercise_id',
        'set_number',
        'weight_kg',
        'reps',
        'rpe',
    ];

    protected $casts = [
        'weight_kg' => 'decimal:2',
        'reps' => 'integer',
        'rpe' => 'integer',
    ];

    public function workoutExercise(): BelongsTo
    {
        return $this->belongsTo(WorkoutExercise::class);
    }
}