<?php

namespace App\Services\Progression;

use App\Models\Achievement;
use App\Models\PersonalRecord;
use App\Models\User;
use App\Models\UserAchievement;
use App\Models\WorkoutSession;
use App\Models\XpEvent;
use Illuminate\Support\Facades\DB;

/**
 * Decides which badges a member has earned.
 *
 * Two deliberate choices shape this:
 *
 * 1. Unlocks are evaluated from STORED HISTORY, not from whatever just
 *    happened. A member who was already at eleven sessions before badges
 *    existed should get the ten-session badge on the next check, not be told
 *    they missed it. Every criterion is therefore a query, not a counter the
 *    caller has to remember to increment.
 *
 * 2. The catalogue lives in config/achievements.php. Adding a tier is a config
 *    entry, and the sweeps below only need one new case if it introduces a
 *    genuinely new KIND of criterion.
 */
class AchievementService
{
    public function __construct(private readonly XpService $xp) {}

    /**
     * Ensure every badge in the catalogue exists as a row.
     *
     * The catalogue is the source of truth; the table is a projection of it.
     * Re-running is safe and is the intended way to ship a new badge.
     */
    public function syncCatalogue(): int
    {
        $created = 0;

        foreach (config('achievements.badges', []) as $badge) {
            $existing = Achievement::where('key', $badge['key'])->first();

            $attributes = [
                'name_key' => $badge['name_key'],
                'description_key' => $badge['description_key'],
                'icon' => $badge['icon'],
                'category' => $badge['category'],
                'xp_reward' => $badge['xp_reward'],
                'sort_order' => $badge['sort_order'],
            ];

            if ($existing === null) {
                Achievement::create(['key' => $badge['key'], ...$attributes]);
                $created++;
            } else {
                // Keep copy and ordering in step with the catalogue without
                // touching who has already unlocked it.
                $existing->update($attributes);
            }
        }

        return $created;
    }

    /**
     * Grant any badge the member has newly qualified for.
     *
     * Returns the unlocks, because the caller wants to celebrate them and
     * because a badge is worth XP that must be attributed to the same moment.
     *
     * Runs as one transaction so a partial sweep cannot leave a member holding
     * a badge whose XP reward was never paid.
     */
    public function evaluate(User $user): array
    {
        $this->syncCatalogue();

        return DB::transaction(function () use ($user) {
            $owned = UserAchievement::where('user_id', $user->id)
                ->pluck('achievement_id')
                ->all();

            $unlocked = [];

            foreach (Achievement::orderBy('sort_order')->get() as $achievement) {
                if (in_array($achievement->id, $owned, true)) {
                    continue;
                }

                $criteria = $this->criteriaFor($achievement->key);

                if ($criteria === null || ! $this->meets($user, $criteria)) {
                    continue;
                }

                /*
                 * Pay the badge's XP BEFORE recording the unlock.
                 *
                 * The order matters and is not cosmetic. awardExact() can
                 * legitimately decline — the daily cap may be exhausted — and
                 * it reports that by returning 0. Writing the unlock row first
                 * would leave the member holding a badge whose reward was never
                 * paid, and because evaluate() skips anything already owned, the
                 * XP could never be granted afterwards: silently lost for good.
                 * A member would see "+200 XP" on the reward screen and find no
                 * trace of it in their ledger.
                 *
                 * Paying first means a badge is only ever recorded once its
                 * reward is in, or once it was already paid on an earlier run.
                 */
                $paid = $this->xp->awardExact(
                    user: $user,
                    source: XpEvent::SOURCE_ACHIEVEMENT,
                    amount: (int) $achievement->xp_reward,
                    label: $achievement->name_key,
                    dedupeKey: 'achievement:'.$achievement->key,
                    subjectType: Achievement::class,
                    subjectId: $achievement->id,
                );

                // A badge worth 0 XP pays nothing, so 0 is success in that case.
                // Otherwise 0 means the cap refused it — leave the badge locked
                // so a later run can still pay it.
                $alreadyPaid = XpEvent::where('user_id', $user->id)
                    ->where('dedupe_key', 'achievement:'.$achievement->key)
                    ->exists();

                if ((int) $achievement->xp_reward > 0 && $paid === 0 && ! $alreadyPaid) {
                    continue;
                }

                UserAchievement::create([
                    'user_id' => $user->id,
                    'achievement_id' => $achievement->id,
                    'unlocked_at' => now(),
                ]);

                $unlocked[] = $achievement;
            }

            return $unlocked;
        });
    }

    /**
     * Look up a badge's criteria, ignoring the i18n and display fields.
     */
    private function criteriaFor(string $key): ?array
    {
        foreach (config('achievements.badges', []) as $badge) {
            if ($badge['key'] === $key) {
                return $badge['criteria'];
            }
        }

        return null;
    }

    /**
     * Evaluate one criterion against the member's stored history.
     */
    private function meets(User $user, array $criteria): bool
    {
        $threshold = (int) ($criteria['threshold'] ?? 0);

        return match ($criteria['type'] ?? null) {
            'sessions' => $this->completedSessions($user) >= $threshold,
            'prs' => $this->personalRecords($user) >= $threshold,
            'proven_sets' => $this->provenSets($user) >= $threshold,
            'streak' => $this->currentStreakWeeks($user) >= $threshold,
            'sessions_in_month' => $this->sessionsThisMonth($user) >= $threshold,
            'program_weeks' => $this->activeProgramWeeks($user) >= $threshold,
            default => false,
        };
    }

    /** Sessions actually finished — not ones merely opened. */
    private function completedSessions(User $user): int
    {
        return WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->count();
    }

    private function sessionsThisMonth(User $user): int
    {
        return WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->whereBetween('finished_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->count();
    }

    private function personalRecords(User $user): int
    {
        return PersonalRecord::where('user_id', $user->id)->count();
    }

    /**
     * Sets that carried photo evidence.
     *
     * Photo proof is the one signal that is expensive to fake, so it is worth
     * its own badge line.
     */
    private function provenSets(User $user): int
    {
        return XpEvent::where('user_id', $user->id)
            ->where('source', XpEvent::SOURCE_PROVEN_SET)
            ->count();
    }

    /**
     * Consecutive weeks with at least one completed session, ending this week.
     *
     * A gap ends the run, but a week with no session yet does NOT — otherwise
     * every member's streak would reset each Monday morning before they had a
     * chance to train.
     */
    private function currentStreakWeeks(User $user): int
    {
        $dates = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->orderByDesc('finished_at')
            ->pluck('finished_at');

        if ($dates->isEmpty()) {
            return 0;
        }

        // Which ISO weeks the member trained, most recent first.
        $weeks = $dates
            ->map(fn ($date) => $date->copy()->startOfWeek()->toDateString())
            ->unique()
            ->values();

        $thisWeek = now()->startOfWeek()->toDateString();

        // Last week counts as current: the member may simply not have trained
        // yet this week.
        $lastWeek = now()->subWeek()->startOfWeek()->toDateString();

        $first = $weeks->first();

        if ($first !== $thisWeek && $first !== $lastWeek) {
            return 0;
        }

        $streak = 0;
        $cursor = \Carbon\Carbon::parse($first);

        foreach ($weeks as $week) {
            if ($week === $cursor->toDateString()) {
                $streak++;
                $cursor->subWeek();
            } else {
                break;
            }
        }

        return $streak;
    }

    /**
     * How many distinct weeks the member has trained inside their current
     * program window. Used by the coach-program badge.
     */
    private function activeProgramWeeks(User $user): int
    {
        $assignment = DB::table('trainer_assignments')
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->orderByDesc('id')
            ->first();

        if ($assignment === null) {
            return 0;
        }

        // Count from when the assignment actually started, falling back to
        // creation for rows confirmed before started_at was recorded.
        $start = \Carbon\Carbon::parse($assignment->started_at ?? $assignment->created_at);

        return (int) floor($start->diffInWeeks(now()));
    }

    /**
     * A member's badges, unlocked and locked, for the achievements page.
     *
     * Locked badges are returned too — they are the point. Seeing the next tier
     * with its requirement is what turns a list into something to aim at.
     */
    public function boardFor(User $user): array
    {
        $this->syncCatalogue();

        $unlocked = UserAchievement::where('user_id', $user->id)
            ->get()
            ->keyBy('achievement_id');

        return Achievement::orderBy('sort_order')
            ->get()
            ->map(fn (Achievement $achievement) => [
                'key' => $achievement->key,
                'name_key' => $achievement->name_key,
                'description_key' => $achievement->description_key,
                'icon' => $achievement->icon,
                'category' => $achievement->category,
                'xp_reward' => $achievement->xp_reward,
                'unlocked' => $unlocked->has($achievement->id),
                'unlocked_at' => $unlocked->get($achievement->id)?->unlocked_at?->toIso8601String(),
                'seen' => $unlocked->get($achievement->id)?->seen_at !== null,
            ])
            ->all();
    }

    /**
     * Badges unlocked but not yet shown to the member.
     */
    public function unseenFor(User $user): array
    {
        return UserAchievement::where('user_id', $user->id)
            ->whereNull('seen_at')
            ->with('achievement')
            ->get()
            ->map(fn (UserAchievement $unlock) => [
                'key' => $unlock->achievement->key,
                'name_key' => $unlock->achievement->name_key,
                'icon' => $unlock->achievement->icon,
                'xp_reward' => $unlock->achievement->xp_reward,
                'unlocked_at' => $unlock->unlocked_at?->toIso8601String(),
            ])
            ->all();
    }

    /**
     * Mark unlocks as seen once they have been celebrated.
     */
    public function markSeen(User $user, array $keys = []): void
    {
        $query = UserAchievement::where('user_id', $user->id)->whereNull('seen_at');

        if ($keys !== []) {
            $ids = Achievement::whereIn('key', $keys)->pluck('id');
            $query->whereIn('achievement_id', $ids);
        }

        $query->update(['seen_at' => now()]);
    }

    /**
     * Count of earned badges, for the profile summary.
     */
    public function countFor(User $user): array
    {
        $total = Achievement::count();
        $earned = UserAchievement::where('user_id', $user->id)->count();

        return ['earned' => $earned, 'total' => $total];
    }
}
