<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A certificate awarded for completing a milestone in full.
 *
 * The member's name and the achievement wording are stored on the row rather
 * than looked up: a certificate records a moment, and reprinting it years later
 * must reproduce exactly what was issued, even if the member has since renamed
 * themselves or the wording has been revised.
 */
class Certificate extends Model
{
    use HasFactory;

    /** Completed an entire session-count ladder. */
    public const MILESTONE_SESSIONS = 'sessions';

    /** Held a training streak for the full ladder. */
    public const MILESTONE_STREAK = 'streak';

    /** Built a body of personal records. */
    public const MILESTONE_STRENGTH = 'strength';

    /** Trained consistently across a sustained period. */
    public const MILESTONE_CONSISTENCY = 'consistency';

    protected $fillable = [
        'user_id',
        'milestone',
        'serial',
        'member_name',
        'title',
        'subtitle',
        'stats',
        'trainer_name',
        'trainer_id',
        'issued_at',
    ];

    protected $casts = [
        'stats' => 'array',
        'issued_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function trainer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'trainer_id');
    }

    /**
     * The translation key for this milestone's name.
     *
     * Derived rather than stored so the certificate can be displayed in either
     * language without the row carrying copy.
     */
    public function titleKey(): string
    {
        return 'certificate.milestone.'.$this->milestone.'.title';
    }

    public function subtitleKey(): string
    {
        return 'certificate.milestone.'.$this->milestone.'.subtitle';
    }
}
