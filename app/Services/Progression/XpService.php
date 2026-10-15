<?php

namespace App\Services\Progression;

use App\Models\User;
use App\Models\UserStat;
use App\Models\XpEvent;
use Illuminate\Support\Facades\DB;

/**
 * Awards XP and keeps a member's level in step.
 *
 * The whole system hangs off one idea: XP must be earned from things that are
 * hard to fake. A member cannot farm this by opening a session, and cannot
 * re-finish last week's workout for a second payout, because every award
 * carries a dedupe key and the ledger enforces uniqueness.
 *
 * Two numbers are tracked on purpose:
 *
 *   total_xp   — lifetime, never reduced. What the member has ever done.
 *   current_xp — spendable, and the input to the level curve. Penalties hit
 *                this one only.
 *
 * Reducing lifetime XP to punish a missed session would erase real history and
 * make the number untrustworthy; a member who sees their all-time total drop
 * stops believing anything the system says.
 */
class XpService
{
    /**
     * XP per source.
     *
     * Ordered by how hard the action is, not by how often it happens. A proven
     * set is worth a token amount because it is a bonus on top of the session,
     * while a personal record is worth far more because it is rare and cannot be
     * manufactured by simply showing up.
     *
     * NOTE: achievement rewards are deliberately absent. Each badge pays its own
     * xp_reward, so a flat entry here would either over- or under-pay the
     * catalogue. Badges are awarded via awardExact() instead.
     */
    public const AWARDS = [
        XpEvent::SOURCE_WORKOUT_COMPLETED => 50,
        XpEvent::SOURCE_PROVEN_SET => 5,
        XpEvent::SOURCE_PR_SET => 75,
        XpEvent::SOURCE_SCHEDULE_KEPT => 25,
        XpEvent::SOURCE_STREAK_WEEK => 20,
        XpEvent::SOURCE_SESSION_MISSED => -30,
    ];

    /**
     * Ceiling on XP earned in a single day, excluding penalties.
     *
     * Without this, the cheapest award (proven sets) could be repeated many
     * times over by a member grinding out empty sets, and the level would stop
     * meaning anything. The cap is set high enough that an honest long session
     * never hits it — it only catches abuse.
     */
    public const DAILY_EARN_CAP = 600;

    /**
     * Award XP for an action.
     *
     * Returns the XP actually granted, which may be less than requested when the
     * daily cap bites, or zero when the dedupe key has already been used. The
     * caller needs the real figure so the reward screen cannot claim points the
     * ledger refused.
     *
     * Repeatable awards (a proven set, a PR) pass a key unique to that set or
     * record, so the same action twice still pays twice, while the SAME action
     * replayed pays once.
     */
    public function award(
        User $user,
        string $source,
        ?string $label = null,
        ?string $dedupeKey = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
    ): int {
        $amount = self::AWARDS[$source] ?? 0;

        if ($amount === 0) {
            return 0;
        }

        return $this->apply(
            user: $user,
            source: $source,
            amount: $amount,
            label: $label,
            dedupeKey: $dedupeKey,
            subjectType: $subjectType,
            subjectId: $subjectId,
        );
    }

    /**
     * Award a caller-supplied amount.
     *
     * Used where the payout is data rather than a constant — a badge carries its
     * own xp_reward, and different badges pay different amounts, so a flat table
     * entry could not express them.
     */
    public function awardExact(
        User $user,
        string $source,
        int $amount,
        ?string $label = null,
        ?string $dedupeKey = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
    ): int {
        if ($amount === 0) {
            return 0;
        }

        return $this->apply(
            user: $user,
            source: $source,
            amount: $amount,
            label: $label,
            dedupeKey: $dedupeKey,
            subjectType: $subjectType,
            subjectId: $subjectId,
        );
    }

    /**
     * The shared award path.
     *
     * Deliberately transaction-neutral: this runs both on its own (finishing a
     * workout) and inside a larger sweep (a badge unlock that also pays XP).
     * Opening a nested transaction here would let the inner savepoint read a
     * stats row the outer transaction had not yet committed, silently dropping
     * the award. Joining the caller's transaction keeps both paths correct, and
     * the row lock is what actually serialises concurrent awards.
     */
    private function apply(
        User $user,
        string $source,
        int $amount,
        ?string $label,
        ?string $dedupeKey,
        ?string $subjectType,
        ?int $subjectId,
    ): int {
        $stat = $this->statFor($user, lock: true);

        // Already granted — replayed action, not a new one.
        if ($dedupeKey !== null && $this->eventExists($user, $dedupeKey)) {
            return 0;
        }

        $granted = $amount;

        if ($amount > 0) {
            $granted = $this->applyDailyCap($user, $amount);

            if ($granted === 0) {
                return 0;
            }
        }

        XpEvent::create([
            'user_id' => $user->id,
            'source' => $source,
            'amount' => $granted,
            'label' => $label,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'dedupe_key' => $dedupeKey,
        ]);

        $stat->current_xp += $granted;
        $stat->last_activity_at = now();

        // Lifetime total only ever grows. A penalty leaves it untouched.
        if ($granted > 0) {
            $stat->total_xp += $granted;
        }

        /*
         * The balance may go negative after a penalty. Clamping it to zero is
         * deliberate: a member should not have to climb out of a hole before
         * their next session counts, and the curve should never have to reason
         * about negative input. What they earned is still on record in total_xp
         * and in the ledger, so nothing is actually lost.
         */
        if ($stat->current_xp < 0) {
            $stat->current_xp = 0;
        }

        /*
         * A level is a milestone, not a gauge.
         *
         * Recomputing it from the balance alone would let a single missed
         * session demote someone — a member who has been training for months
         * would watch "Level 7" become "Level 6" because they skipped one day.
         * The level is the record of what they have reached, so it only ever
         * moves up: the newly derived level is taken only when it exceeds the
         * stored one.
         *
         * The balance still falls, so XP remains spendable and the progress bar
         * still reflects a setback honestly; it is the rank that is protected.
         * A member is never told they have achieved less than they did.
         */
        $derivedLevel = $this->levelForXp($stat->current_xp);

        if ($derivedLevel > $stat->level) {
            $stat->level = $derivedLevel;
        }

        $stat->save();

        return $granted;
    }

    /**
     * XP still grantable today after the daily cap.
     *
     * Counted from the ledger rather than a counter column so the cap cannot
     * drift out of step with actual awards.
     */
    public function remainingDailyAllowance(User $user): int
    {
        $earned = XpEvent::where('user_id', $user->id)
            ->where('amount', '>', 0)
            ->whereDate('created_at', today())
            ->sum('amount');

        return max(0, self::DAILY_EARN_CAP - (int) $earned);
    }

    /**
     * Clamp an award to what the daily cap still allows.
     */
    private function applyDailyCap(User $user, int $amount): int
    {
        $allowed = $this->remainingDailyAllowance($user);

        if ($allowed <= 0) {
            return 0;
        }

        return min($amount, $allowed);
    }

    private function eventExists(User $user, string $dedupeKey): bool
    {
        return XpEvent::where('user_id', $user->id)
            ->where('dedupe_key', $dedupeKey)
            ->exists();
    }

    /**
     * The member's stats row, created on first use.
     *
     * The row is created up front with firstOrCreate and only THEN locked, so
     * the lock always applies to a row that definitely exists. Locking and
     * creating in one step is what previously let a brand-new member's award be
     * computed against a row the surrounding transaction could not yet see.
     *
     * Pass lock: true when the caller is about to write, so two concurrent
     * awards cannot both read the same starting balance and lose one increment.
     */
    public function statFor(User $user, bool $lock = false): UserStat
    {
        // Safe to call unconditionally: a no-op when the row is already there.
        $stat = UserStat::firstOrCreate(
            ['user_id' => $user->id],
            ['total_xp' => 0, 'current_xp' => 0, 'level' => 1],
        );

        if ($lock) {
            // Re-read under the lock so a concurrent award that committed
            // between the call above and here is picked up rather than
            // overwritten with a stale balance.
            $stat = UserStat::whereKey($stat->getKey())->lockForUpdate()->first() ?? $stat;
        }

        return $stat;
    }

    /**
     * Level for a given XP balance.
     *
     * Uses the same curve as xpRequiredForLevel(); this walks it upward so the
     * two can never disagree.
     */
    public function levelForXp(int $xp): int
    {
        if ($xp <= 0) {
            return 1;
        }

        $level = 1;

        while ($xp >= $this->xpRequiredForLevel($level + 1)) {
            $level++;

            // Guard against a runaway loop if the curve is ever retuned badly.
            if ($level > 999) {
                break;
            }
        }

        return $level;
    }

    /**
     * Cumulative XP needed to REACH a level.
     *
     * Exposed because both the progress bar and the level-up screen need it,
     * and they must agree with the curve used here.
     *
     * The curve
     * ---------
     * The cost of level n is 100 * n^1.35, which was chosen after the original
     * 100 * n^1.5 proved too steep in practice. With a finished session worth
     * roughly 145 XP, the old curve made level 3→4 cost 520 XP (~3.6 sessions)
     * and level 5→6 cost ~800 XP (~5.5 sessions) — a member hit a wall exactly
     * where momentum mattered most, and a bar reading 0% right after a level-up
     * reads as a broken reward rather than a new chapter.
     *
     * The gentler exponent keeps early levels quick, stretches the later ones
     * so the last ten still mean something, and keeps any single level within
     * roughly three to eight sessions of effort.
     */
    public function xpRequiredForLevel(int $level): int
    {
        if ($level <= 1) {
            return 0;
        }

        $total = 0;

        for ($n = 1; $n < $level; $n++) {
            $total += (int) round(100 * ($n ** 1.35));
        }

        return $total;
    }

    /**
     * Everything the UI needs to render progression in one call.
     *
     * Computed here rather than in the frontend so the progress bar, the
     * sidebar and the level-up screen can never disagree about how far along
     * the member is.
     */
    public function progressFor(User $user): array
    {
        $stat = $this->statFor($user);

        $level = $stat->level;
        $floorXp = $this->xpRequiredForLevel($level);
        $nextXp = $this->xpRequiredForLevel($level + 1);

        $intoLevel = max(0, $stat->current_xp - $floorXp);
        $levelSpan = max(1, $nextXp - $floorXp);

        return [
            'level' => $level,
            'current_xp' => $stat->current_xp,
            'total_xp' => $stat->total_xp,
            'xp_into_level' => $intoLevel,
            'xp_for_next_level' => $levelSpan,
            'xp_to_next_level' => max(0, $nextXp - $stat->current_xp),
            // Already rounded here so the bar and the label cannot disagree.
            'progress_percent' => (int) round(min(100, ($intoLevel / $levelSpan) * 100)),
            'next_level' => $level + 1,
            'rank' => $stat->rank,
        ];
    }

    /**
     * Recent awards, newest first, for the ledger view.
     */
    public function recentEvents(User $user, int $limit = 20): array
    {
        return XpEvent::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn (XpEvent $event) => [
                'id' => $event->id,
                'source' => $event->source,
                'amount' => $event->amount,
                'label' => $event->label,
                'created_at' => $event->created_at?->toIso8601String(),
            ])
            ->all();
    }
}
