<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A badge a member can earn.
 *
 * Labels are translation KEYS, not copy: the same badge renders in the sidebar,
 * the achievements page and the level-up screen, and storing English text would
 * freeze it in one language.
 */
class Achievement extends Model
{
    use HasFactory;

    public const CATEGORY_MILESTONE = 'milestone';
    public const CATEGORY_STREAK = 'streak';
    public const CATEGORY_STRENGTH = 'strength';
    public const CATEGORY_CONSISTENCY = 'consistency';

    protected $fillable = [
        'key',
        'name_key',
        'description_key',
        'icon',
        'category',
        'xp_reward',
        'sort_order',
    ];

    protected $casts = [
        'xp_reward' => 'integer',
        'sort_order' => 'integer',
    ];

    public function unlocks(): HasMany
    {
        return $this->hasMany(UserAchievement::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_achievements')
            ->withPivot(['unlocked_at', 'seen_at']);
    }
}
