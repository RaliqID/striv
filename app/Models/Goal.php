<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Goal extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'exercise_id',
        'target_type',
        'target_value',
        'target_reps',
        'deadline',
        'status',
    ];

    protected $casts = [
        // float, NOT decimal:2 — decimal serializes to string and crashes
        // frontend .toFixed() calls (see Profile weight_kg bug).
        'target_value' => 'float',
        'target_reps' => 'integer',
        'deadline' => 'date',
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
}