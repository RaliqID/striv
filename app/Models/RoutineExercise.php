<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoutineExercise extends Model
{
    use HasFactory;

    protected $fillable = [
        'routine_id',
        'exercise_id',
        'order',
        'target_sets',
        'target_reps',
        'target_weight_kg',
    ];

    protected $casts = [
        'order' => 'integer',
        'target_sets' => 'integer',
        'target_reps' => 'integer',
        'target_weight_kg' => 'decimal:2',
    ];

    public function routine(): BelongsTo
    {
        return $this->belongsTo(Routine::class);
    }

    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }
}
