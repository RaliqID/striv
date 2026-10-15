<?php

namespace App\Services\Progression;

use App\Models\Certificate;
use App\Models\PersonalRecord;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Facades\DB;

/**
 * Issues certificates when a member completes a milestone in full.
 *
 * The rule is deliberately "the whole ladder, not a level". Each milestone is a
 * set of tiers (10, 50, 100 sessions; 2, 4, 8, 12 weeks) and the certificate is
 * earned by clearing the top tier, which means the badge system has already been
 * walked through step by step. That is what makes it worth printing: it is not
 * a number that drifted upward, it is a body of work with the intermediate
 * evidence attached.
 *
 * Every check reads stored history rather than a counter, so a member who
 * qualified before certificates existed still receives one on the next sweep
 * instead of being told they missed it.
 */
class CertificateService
{
    /**
     * The top tier of each ladder, and what it takes to be certified.
     *
     * Kept here rather than in config because these figures are referenced by
     * the earning check itself — splitting them from the logic that uses them
     * would let them drift out of step.
     */
    public const MILESTONES = [
        Certificate::MILESTONE_SESSIONS => ['threshold' => 100, 'unit' => 'sessions'],
        Certificate::MILESTONE_STREAK => ['threshold' => 12, 'unit' => 'weeks'],
        Certificate::MILESTONE_STRENGTH => ['threshold' => 25, 'unit' => 'records'],
        Certificate::MILESTONE_CONSISTENCY => ['threshold' => 12, 'unit' => 'month_sessions'],
    ];

    public function __construct(private readonly AchievementService $achievements) {}

    /**
     * Issue any certificate the member has newly earned.
     *
     * Returns the newly issued certificates so the caller can celebrate them,
     * the same way AchievementService returns fresh unlocks.
     *
     * Wrapped in a transaction: a certificate that is recorded but whose stats
     * snapshot failed to write would be a permanent half-document.
     */
    public function evaluate(User $user): array
    {
        return DB::transaction(function () use ($user) {
            $issued = [];

            foreach (self::MILESTONES as $milestone => $spec) {
                // Issued once, ever. The unique index enforces it, this avoids
                // the pointless write.
                if (Certificate::where('user_id', $user->id)->where('milestone', $milestone)->exists()) {
                    continue;
                }

                $evidence = $this->evidenceFor($user, $milestone);

                if ($evidence === null) {
                    continue;
                }

                $issued[] = $this->issue($user, $milestone, $evidence);
            }

            return $issued;
        });
    }

    /**
     * The proof for a milestone, or null when it is not yet earned.
     *
     * Returning the numbers rather than a boolean is deliberate: the certificate
     * prints them, so they would otherwise have to be recomputed at render time
     * against data that has since moved on.
     */
    private function evidenceFor(User $user, string $milestone): ?array
    {
        return match ($milestone) {
            Certificate::MILESTONE_SESSIONS => $this->sessionEvidence($user),
            Certificate::MILESTONE_STREAK => $this->streakEvidence($user),
            Certificate::MILESTONE_STRENGTH => $this->strengthEvidence($user),
            Certificate::MILESTONE_CONSISTENCY => $this->consistencyEvidence($user),
            default => null,
        };
    }

    private function sessionEvidence(User $user): ?array
    {
        $count = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->count();

        if ($count < self::MILESTONES[Certificate::MILESTONE_SESSIONS]['threshold']) {
            return null;
        }

        return [
            'sessions' => $count,
            'volume_kg' => (int) $this->totalVolume($user),
            'first_session' => WorkoutSession::where('user_id', $user->id)
                ->whereNotNull('finished_at')
                ->orderBy('finished_at')
                ->value('finished_at')?->toDateString(),
        ];
    }

    private function streakEvidence(User $user): ?array
    {
        $weeks = $this->consecutiveWeeks($user);

        if ($weeks < self::MILESTONES[Certificate::MILESTONE_STREAK]['threshold']) {
            return null;
        }

        return [
            'weeks' => $weeks,
            'sessions' => WorkoutSession::where('user_id', $user->id)
                ->whereNotNull('finished_at')
                ->count(),
        ];
    }

    private function strengthEvidence(User $user): ?array
    {
        $count = PersonalRecord::where('user_id', $user->id)->count();

        if ($count < self::MILESTONES[Certificate::MILESTONE_STRENGTH]['threshold']) {
            return null;
        }

        return [
            'records' => $count,
            'exercises' => PersonalRecord::where('user_id', $user->id)
                ->distinct()
                ->count('exercise_id'),
        ];
    }

    /**
     * A full month of consistent training at the target frequency.
     *
     * Measured over the member's BEST calendar month, not the current one.
     *
     * The first version counted only sessions in the month happening right now,
     * which was unfair in two ways: the milestone could only ever be earned on
     * the last days of a month, and it silently expired the moment the calendar
     * turned over — a member could hold it on the 31st and lose the chance on
     * the 1st despite training harder than before. Consistency is something a
     * member has DONE; the calendar should not be able to take it back.
     *
     * Counting the best month means once a member has genuinely trained at
     * target frequency for a month, the certificate is theirs permanently.
     */
    private function consistencyEvidence(User $user): ?array
    {
        $threshold = self::MILESTONES[Certificate::MILESTONE_CONSISTENCY]['threshold'];

        $best = DB::table('workout_sessions')
            ->where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->selectRaw("strftime('%Y-%m', finished_at) as ym, COUNT(*) as c")
            ->groupBy('ym')
            ->orderByDesc('c')
            ->first();

        if ($best === null || (int) $best->c < $threshold) {
            return null;
        }

        return [
            'month_sessions' => (int) $best->c,
            'month' => $best->ym,
        ];
    }

    /**
     * Issue the certificate and assign its serial.
     *
     * The serial is sequential per milestone so it reads as a document number
     * rather than a random token, which matters if a member ever quotes it.
     */
    private function issue(User $user, string $milestone, array $evidence): Certificate
    {
        $trainer = $this->trainerFor($user);

        return Certificate::create([
            'user_id' => $user->id,
            'milestone' => $milestone,
            'serial' => $this->nextSerial($milestone),
            'member_name' => $user->name,
            // Stored in English as the canonical record; the UI renders the
            // translated form from titleKey() and only falls back to this.
            'title' => $milestone,
            'subtitle' => null,
            'stats' => $evidence,
            'trainer_name' => $trainer?->name,
            'trainer_id' => $trainer?->id,
            'issued_at' => now(),
        ]);
    }

    /**
     * The member's current trainer, for the signature line.
     *
     * Returns null for self-guided members rather than blocking issuance — the
     * certificate is theirs, the signature is a bonus.
     */
    private function trainerFor(User $user): ?User
    {
        $assignment = DB::table('trainer_assignments')
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->orderByDesc('id')
            ->first();

        if ($assignment === null) {
            return null;
        }

        return User::find($assignment->trainer_id);
    }

    /** STRIV-<MILESTONE>-0007, unique across all certificates. */
    private function nextSerial(string $milestone): string
    {
        $prefix = 'STRIV-'.strtoupper($milestone).'-';

        // Count existing serials for this milestone, then walk forward until a
        // free number is found. The unique index is the real guard; this loop
        // just avoids colliding with it if a row was ever removed.
        $n = Certificate::where('milestone', $milestone)->count() + 1;

        do {
            $serial = $prefix.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
            $n++;
        } while (Certificate::where('serial', $serial)->exists());

        return $serial;
    }

    /**
     * Total weight lifted, across every finished session.
     *
     * Derived from the sets rather than a stored total so it always agrees with
     * the session detail the member can open and check.
     */
    private function totalVolume(User $user): float
    {
        return (float) DB::table('workout_sets')
            ->join('workout_exercises', 'workout_sets.workout_exercise_id', '=', 'workout_exercises.id')
            ->join('workout_sessions', 'workout_exercises.workout_session_id', '=', 'workout_sessions.id')
            ->where('workout_sessions.user_id', $user->id)
            ->whereNotNull('workout_sessions.finished_at')
            ->whereNotNull('workout_sets.completed_at')
            ->sum(DB::raw('COALESCE(workout_sets.weight_kg, 0) * COALESCE(workout_sets.reps, 0)'));
    }

    /**
     * Consecutive training weeks ending at the most recent one.
     *
     * Mirrors AchievementService's rule, including that a week with no session
     * YET does not break the run — otherwise every streak would reset each
     * Monday before the member had a chance to train.
     */
    private function consecutiveWeeks(User $user): int
    {
        $dates = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->orderByDesc('finished_at')
            ->pluck('finished_at');

        if ($dates->isEmpty()) {
            return 0;
        }

        $weeks = $dates
            ->map(fn ($d) => $d->copy()->startOfWeek()->toDateString())
            ->unique()
            ->values();

        $thisWeek = now()->startOfWeek()->toDateString();
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

    /** Everything the member has earned, newest first. */
    public function forUser(User $user): array
    {
        return Certificate::where('user_id', $user->id)
            ->orderByDesc('issued_at')
            ->get()
            ->all();
    }
}
