<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Progression\AchievementService;
use App\Services\Progression\XpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Progression surfaces: XP/level, badges, and the member leaderboard.
 *
 * Reads only. All the arithmetic lives in the progression services so the
 * sidebar, the profile and these endpoints cannot disagree about a level.
 *
 * Every method is defensively wrapped: progression is a nice-to-have on top of
 * a training app, so a failure in it must degrade to an empty shape rather
 * than take down the page that called it. Precedent: the try/catch around PR
 * detection in WorkoutSessionController::finish().
 */
class ProgressionController extends Controller
{
    /** How many rows the leaderboard returns, and how deep a member can place. */
    private const LEADERBOARD_LIMIT = 50;

    public function __construct(
        private readonly XpService $xp,
        private readonly AchievementService $achievements,
    ) {
    }

    /**
     * Everything the member's own progression screen needs, in one call.
     *
     * Assembled here rather than fetched piecemeal so the dashboard, the
     * sidebar and the level-up moment are all driven by the same numbers.
     */
    public function stats(Request $request)
    {
        $user = $request->user();

        $progress = [];
        try {
            $progress = $this->xp->progressFor($user);
        } catch (\Throwable $e) {
            Log::warning('Progression progress failed for user '.$user->id, ['error' => $e->getMessage()]);
        }

        $achievements = ['earned' => 0, 'total' => 0];
        try {
            $achievements = $this->achievements->countFor($user);
        } catch (\Throwable $e) {
            Log::warning('Progression achievement count failed for user '.$user->id, ['error' => $e->getMessage()]);
        }

        // Unseen unlocks are returned so the client can celebrate them on the
        // next visit — a badge earned while the member was away should not
        // appear silently in a list.
        $unseen = [];
        try {
            $unseen = $this->achievements->unseenFor($user);
        } catch (\Throwable $e) {
            Log::warning('Progression unseen achievements failed for user '.$user->id, ['error' => $e->getMessage()]);
        }

        $remaining = 0;
        try {
            $remaining = $this->xp->remainingDailyAllowance($user);
        } catch (\Throwable $e) {
            Log::warning('Progression daily allowance failed for user '.$user->id, ['error' => $e->getMessage()]);
        }

        $recentEvents = [];
        try {
            $recentEvents = $this->xp->recentEvents($user, 20);
        } catch (\Throwable $e) {
            Log::warning('Progression recent events failed for user '.$user->id, ['error' => $e->getMessage()]);
        }

        return response()->json([
            'progress' => $progress,
            'achievements' => $achievements,
            'unseen' => $unseen,
            'daily' => [
                'cap' => XpService::DAILY_EARN_CAP,
                'remaining' => $remaining,
            ],
            'recent_events' => $recentEvents,
        ]);
    }

    /**
     * The full badge board, locked badges included.
     *
     * The locked ones are the point: a wall of earned badges is a trophy
     * cabinet, while the next tier sitting greyed out with its requirement is
     * what gives the member something to aim at.
     */
    public function achievements(Request $request)
    {
        try {
            $board = $this->achievements->boardFor($request->user());
        } catch (\Throwable $e) {
            Log::warning('Progression board failed for user '.$request->user()->id, ['error' => $e->getMessage()]);
            $board = [];
        }

        return response()->json(['achievements' => $board]);
    }

    /**
     * Acknowledge unlocks once they have been shown, so they are not
     * celebrated twice.
     *
     * An empty (or omitted) key list marks everything currently unseen.
     */
    public function markAchievementsSeen(Request $request)
    {
        $validated = $request->validate([
            'keys' => ['nullable', 'array'],
            'keys.*' => ['string'],
        ]);

        try {
            $this->achievements->markSeen($request->user(), $validated['keys'] ?? []);
        } catch (\Throwable $e) {
            Log::warning('Progression mark seen failed for user '.$request->user()->id, ['error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Members ranked by current XP.
     *
     * Two rules shape this response, both deliberate:
     *
     * 1. Only member accounts appear. Trainers and admins are staff, not
     *    competitors, and several are demo/system accounts — letting them take
     *    the top spots would make the board meaningless and would leak who the
     *    staff are.
     *
     * 2. The only identity exposed is a display name. A member's real name if
     *    we have one, otherwise a MASKED email. The full email is never
     *    returned, and neither is any other personal field: a leaderboard is
     *    public within the app, so anything on it is effectively published to
     *    every other member.
     */
    public function leaderboard(Request $request)
    {
        $user = $request->user();

        $rows = [];
        try {
            $rows = DB::table('user_stats')
                ->join('users', 'users.id', '=', 'user_stats.user_id')
                ->where('users.role', User::ROLE_USER)
                // Stable ordering: two members on the same XP must not swap
                // position between calls, so ties fall through to lifetime XP
                // and finally to id.
                ->orderByDesc('user_stats.current_xp')
                ->orderByDesc('user_stats.total_xp')
                ->orderBy('user_stats.user_id')
                ->limit(self::LEADERBOARD_LIMIT)
                ->get([
                    'user_stats.user_id',
                    'user_stats.current_xp',
                    'user_stats.total_xp',
                    'user_stats.level',
                    'users.name',
                    'users.email',
                ]);
        } catch (\Throwable $e) {
            Log::warning('Leaderboard build failed', ['error' => $e->getMessage()]);
            return response()->json(['entries' => [], 'me' => null]);
        }

        $entries = [];
        $rank = 0;

        foreach ($rows as $row) {
            $rank++;

            $entries[] = [
                'rank' => $rank,
                'name' => $this->displayName($row->name, $row->email),
                'level' => (int) $row->level,
                'xp' => (int) $row->current_xp,
                'total_xp' => (int) $row->total_xp,
            ];
        }

        // The member's own row, independent of whether they made the top slice,
        // so their profile can always show where they stand. Resolved from the
        // raw rows by id — the shaped entries carry no id on purpose, so the
        // leaderboard payload cannot be used to map a name back to an account.
        $me = $this->ownRow($rows, $entries, $user);
        if ($me !== null) {
            $this->persistRank($user, $me['rank']);
        }

        return response()->json([
            'entries' => $entries,
            'me' => $me,
        ]);
    }

    /**
     * The requesting member's own row, shaped the same as the entries, or null
     * when they are not a member or have no stats row yet.
     *
     * @param  \Illuminate\Support\Collection  $rows
     * @param  array<int, array<string, mixed>>  $entries
     * @return array<string, mixed>|null
     */
    private function ownRow($rows, array $entries, User $user): ?array
    {
        if ($user->role !== User::ROLE_USER) {
            return null;
        }

        foreach ($rows as $index => $row) {
            if ((int) $row->user_id === $user->id) {
                return $entries[$index] ?? null;
            }
        }

        return null;
    }

    /**
     * Cache the member's rank on their stats row.
     *
     * The leaderboard is a full sort and the profile wants the number on every
     * load, so the position is written back here rather than recomputed
     * wherever it is displayed. The column exists for exactly this.
     */
    private function persistRank(User $user, int $rank): void
    {
        try {
            // A create is safe: a member with a leaderboard position by
            // definition already has a stats row, but firstOrCreate keeps this
            // correct if that ever stops being true.
            $this->xp->statFor($user)->forceFill(['rank' => $rank])->save();
        } catch (\Throwable $e) {
            Log::warning('Leaderboard rank persist failed for user '.$user->id, ['error' => $e->getMessage()]);
        }
    }

    /**
     * A safe name for the public board.
     *
     * Prefers the member's chosen name; falls back to a masked email
     * (`r***@gmail.com`) so a member who never set a name is still
     * identifiable to themselves without their address being published.
     */
    private function displayName(?string $name, ?string $email): string
    {
        $name = trim((string) $name);
        if ($name !== '') {
            return $name;
        }

        return $this->maskEmail((string) $email);
    }

    /**
     * Reduce an email to `first-character***@domain`.
     *
     * Deliberately never returns the full local part: the point is that a name
     * is shown, not an address. A missing or malformed value degrades to a
     * neutral label rather than echoing the raw input.
     */
    private function maskEmail(string $email): string
    {
        if (! str_contains($email, '@')) {
            return 'Member';
        }

        [$local, $domain] = explode('@', $email, 2);

        $local = trim($local);
        if ($local === '' || $domain === '') {
            return 'Member';
        }

        return mb_substr($local, 0, 1).'***@'.$domain;
    }
}
