<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Appends;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role', 'locale', 'is_suspended', 'must_change_password', 'specialization', 'bio', 'avatar_path', 'avatar_mime', 'avatar_updated_at', 'avatar_change_allowed_at', 'is_available', 'capacity', 'phone', 'reminder_email_enabled', 'reminder_whatsapp_enabled', 'remind_morning_of_training', 'remind_streak_break', 'remind_post_workout', 'remind_weekly_recap', 'remind_missed_session'])]
#[Hidden([
    'password',
    'remember_token',
    /*
     * Avatar storage internals.
     *
     * These describe how the file is stored, not how it is shown, and the client
     * has no use for any of them — verified by grepping the frontend for each
     * name: zero references. What the client needs is `avatar_url` (appended
     * below) and `avatar_locked_until`.
     *
     * `avatar_path` in particular is an internal storage layout: publishing it
     * hands out the disk structure and the generated filename for no benefit,
     * and it is exactly the kind of detail that leaks further if storage ever
     * moves. `avatar_mime` and the two timestamps are likewise server-side book-
     * keeping.
     *
     * Hidden only affects JSON serialisation — the accessors that build the URL
     * and the cooldown still read these attributes server-side.
     */
    'avatar_path',
    'avatar_mime',
    'avatar_updated_at',
    'avatar_change_allowed_at',
])]
#[Appends(['is_admin', 'avatar_url', 'avatar_locked_until'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /** Locales the application ships translations for. */
    public const SUPPORTED_LOCALES = ['en', 'id'];

    public const DEFAULT_LOCALE = 'en';

    /** Member under training. */
    public const ROLE_USER = 'user';

    /** Personal trainer: sees and manages assigned clients. */
    public const ROLE_TRAINER = 'trainer';

    /** Full administrator. */
    public const ROLE_ADMIN = 'admin';

    /** Roles allowed into the management panel. */
    public const PANEL_ROLES = [self::ROLE_TRAINER, self::ROLE_ADMIN];

    public function chatSessions(): HasMany
    {
        return $this->hasMany(ChatSession::class);
    }

    public function workoutSessions(): HasMany
    {
        return $this->hasMany(WorkoutSession::class);
    }

    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class);
    }

    public function goals(): HasMany
    {
        return $this->hasMany(Goal::class);
    }

    public function routines(): HasMany
    {
        return $this->hasMany(Routine::class);
    }

    public function chatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }

    // ------------------------------------------------------------------
    // Training relationship
    // ------------------------------------------------------------------

    /** Requests this member has submitted (at most one active at a time). */
    public function trainingRequests(): HasMany
    {
        return $this->hasMany(TrainingRequest::class);
    }

    /** Assignments where this user is the member being trained. */
    public function trainerAssignments(): HasMany
    {
        return $this->hasMany(TrainerAssignment::class, 'user_id');
    }

    /** Assignments where this user is the trainer. */
    public function clientAssignments(): HasMany
    {
        return $this->hasMany(TrainerAssignment::class, 'trainer_id');
    }

    /** The trainer currently responsible for this member, if any. */
    public function activeTrainer(): ?User
    {
        $assignment = $this->trainerAssignments()
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with('trainer')
            ->first();

        return $assignment?->trainer;
    }

    /** Clients currently assigned to this trainer. */
    public function clients(): BelongsToMany
    {
        return $this->belongsToMany(
            User::class,
            'trainer_assignments',
            'trainer_id',
            'user_id',
        )->wherePivot('status', TrainerAssignment::STATUS_ACTIVE);
    }

    /** Feedback this trainer has written for clients. */
    public function feedbackGiven(): HasMany
    {
        return $this->hasMany(TrainerFeedback::class, 'trainer_id');
    }

    /** Feedback this member has received from their trainer. */
    public function feedbackReceived(): HasMany
    {
        return $this->hasMany(TrainerFeedback::class, 'user_id');
    }

    /** In-app notification inbox, newest first. */
    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class)->latest('id');
    }

    /** Just the unread ones — drives the panel badge. */
    public function unreadNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class)->whereNull('read_at');
    }

    /**
     * Average rating this trainer has received, or null when unrated.
     *
     * Computed on user_profiles-style demand (one trainer's card) rather than
     * cached, because the figure changes rarely and a cache here would need
     * invalidation on every rating write for no measurable gain.
     */
    public function averageRating(): ?float
    {
        $avg = TrainerFeedback::where('trainer_id', $this->id)
            ->whereNotNull('rating')
            ->avg('rating');

        return $avg !== null ? round((float) $avg, 2) : null;
    }

    // ------------------------------------------------------------------
    // Role helpers
    // ------------------------------------------------------------------

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    /**
     * Expose is_admin in the JSON payload.
     *
     * The database stores a single `role` column, and that is the right shape
     * for storage — but the client has always read `is_admin` when deciding
     * whether to route someone into the admin panel. Because there is no such
     * column and isAdmin() is a method (not an accessor), the serialised user
     * never carried the key: `user.is_admin` was undefined for every account, so
     * an administrator signing in was sent to the member dashboard instead of
     * the panel, and the admin-only navigation never appeared.
     *
     * The accessor is ADDITIVE. isAdmin() is retained because nine call sites
     * across AdminUserController, EnsureUserIsAdmin, TrainerAssignmentPolicy and
     * AdminGuard invoke it as a method; replacing it with an accessor alone
     * breaks every one of them with "Call to undefined method".
     *
     * `is_admin` is listed in #[Appends] above, otherwise an accessor is not
     * included in toArray()/toJson() and the payload would still lack the key.
     */
    public function getIsAdminAttribute(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    /**
     * The versioned URL for this member's avatar, or null when they have none.
     *
     * Exposed as an appended attribute so every payload that already returns a
     * user — auth, the trainer's client list, the leaderboard — carries the
     * avatar without each responder remembering to add it.
     *
     * Only the URL is published, never `avatar_path`: the storage path is an
     * internal detail and the file is served through an authorised endpoint.
     */
    public function getAvatarUrlAttribute(): ?string
    {
        return \App\Http\Controllers\ProfileAvatarController::urlFor($this);
    }

    /**
     * When this member may next change their photo, or null if they can now.
     *
     * Exposed so the profile page can disable the control and state the wait
     * BEFORE the member picks a file. Letting them choose a photo, upload it and
     * only then be refused is a worse experience than telling them up front —
     * and the server enforces the same rule regardless, so this is convenience,
     * not the boundary.
     */
    public function getAvatarLockedUntilAttribute(): ?string
    {
        $allowedAt = $this->avatar_change_allowed_at;

        if ($allowedAt === null || $allowedAt->isPast()) {
            return null;
        }

        return $allowedAt->toIso8601String();
    }

    /** Whether this account may open the management panel (admin or trainer). */
    public function canAccessPanel(): bool
    {
        return in_array($this->role, self::PANEL_ROLES, true);
    }

    public function isTrainer(): bool
    {
        return $this->role === self::ROLE_TRAINER;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            /*
             * Cast to a date, not left as the raw column value.
             *
             * getAvatarUrlAttribute reads ->timestamp off this to build the
             * cache-busting version in the avatar URL. Without the cast the
             * value is a plain string, ->timestamp yields null, and every avatar
             * URL is issued with `v=0` — so replacing a photo would keep serving
             * the old image from cache and look like a failed upload.
             */
            'avatar_updated_at' => 'datetime',
            /*
             * Cast for the same reason as avatar_updated_at: the cooldown check
             * calls ->isPast() on this value, which requires a Carbon instance.
             * Left as a raw string it would throw rather than compare.
             */
            'avatar_change_allowed_at' => 'datetime',
            'is_suspended' => 'boolean',
            'must_change_password' => 'boolean',
            'is_available' => 'boolean',
            'capacity' => 'integer',
            // Reminder preferences: cast so a null column reads as false rather
            // than as a truthy string when the column is added by migration.
            'reminder_email_enabled' => 'boolean',
            'reminder_whatsapp_enabled' => 'boolean',
            'remind_morning_of_training' => 'boolean',
            'remind_streak_break' => 'boolean',
            'remind_post_workout' => 'boolean',
            'remind_weekly_recap' => 'boolean',
            'remind_missed_session' => 'boolean',
        ];
    }
}
