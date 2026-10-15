<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A member's current progression state.
 *
 * Deliberately one row per member rather than derived on demand: the sidebar
 * shows the level on every page, and summing a year of XP events per request is
 * the kind of query that quietly becomes the slowest thing in the app.
 */
class UserStat extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'total_xp',
        'current_xp',
        'level',
        'rank',
        'last_activity_at',
    ];

    protected $casts = [
        'total_xp' => 'integer',
        'current_xp' => 'integer',
        'level' => 'integer',
        'rank' => 'integer',
        'last_activity_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
