<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A badge a specific member has earned.
 *
 * `seen_at` exists so an unlock can be celebrated later. A badge earned while
 * the member was away should greet them on their next visit, not appear
 * silently in a list they never look at.
 */
class UserAchievement extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'achievement_id',
        'unlocked_at',
        'seen_at',
    ];

    protected $casts = [
        'unlocked_at' => 'datetime',
        'seen_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function achievement(): BelongsTo
    {
        return $this->belongsTo(Achievement::class);
    }

    /** True when the member has not yet been shown this unlock. */
    public function isUnseen(): bool
    {
        return $this->seen_at === null;
    }
}
