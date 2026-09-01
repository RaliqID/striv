<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GoalProgress extends Model
{
    use HasFactory;

    protected $fillable = [
        'goal_id',
        'current_value',
        'recorded_at',
    ];

    protected $casts = [
        'current_value' => 'decimal:2',
        'recorded_at' => 'datetime',
    ];

    public function goal(): BelongsTo
    {
        return $this->belongsTo(Goal::class);
    }
}