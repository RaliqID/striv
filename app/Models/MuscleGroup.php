<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class MuscleGroup extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
    ];

    public function exercises(): BelongsToMany
    {
        return $this->belongsToMany(Exercise::class, 'exercise_muscle')
                    ->withPivot('is_primary')
                    ->withTimestamps();
    }
}