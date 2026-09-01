<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Profile extends Model
{
    use HasFactory;

    protected $table = 'user_profiles';

    protected $fillable = [
        'user_id',
        'age',
        'location',
        'weight_kg',
        'height_cm',
        'target_weight_kg',
        'experience_level',
        'primary_goal',
        'training_frequency',
        'preferences',
        'onboarding_completed_at',
    ];

    protected $casts = [
        'age' => 'integer',
        'weight_kg' => 'decimal:2',
        'height_cm' => 'decimal:2',
        'target_weight_kg' => 'decimal:2',
        'preferences' => 'array',
        'training_frequency' => 'integer',
        'onboarding_completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}