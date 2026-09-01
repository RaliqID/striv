<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Routine extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'notes',
        'est_duration_minutes',
    ];

    protected $casts = [
        'est_duration_minutes' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function routineExercises(): HasMany
    {
        return $this->hasMany(RoutineExercise::class)->orderBy('order');
    }
}
