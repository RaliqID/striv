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
        'target_value' => 'decimal:2',
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