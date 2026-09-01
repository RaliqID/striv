<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Exercise extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'category',
        'movement_pattern',
        'equipment',
    ];

    public function muscleGroups(): BelongsToMany
    {
        return $this->belongsToMany(MuscleGroup::class, 'exercise_muscle')
                    ->withPivot('is_primary')
                    ->withTimestamps();
    }

    public function workoutExercises(): HasMany
    {
        return $this->hasMany(WorkoutExercise::class);
    }

    public function personalRecords(): HasMany
    {
        return $this->hasMany(PersonalRecord::class);
    }

    public function goals(): HasMany
    {
        return $this->hasMany(Goal::class);
    }
}