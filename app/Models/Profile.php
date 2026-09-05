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
        // float, NOT decimal:2 — the decimal cast serializes to a STRING
        // ("53.00") which crashed ProfilePage's n.toFixed() on the frontend.
        'weight_kg' => 'float',
        'height_cm' => 'float',
        'target_weight_kg' => 'float',
        'preferences' => 'array',
        'training_frequency' => 'integer',
        'onboarding_completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}