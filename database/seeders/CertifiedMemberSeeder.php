<?php

namespace Database\Seeders;

use App\Models\Exercise;
use App\Models\Profile;
use App\Models\User;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use App\Services\Progression\AchievementService;
use App\Services\Progression\CertificateService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * A member who has completed every milestone, for testing the certificate flow.
 *
 * Why a real history rather than inserted totals: the certificate service reads
 * stored sessions, sets and records, so writing a fake user_stats row would
 * prove nothing — and would not survive the next evaluation, which recomputes
 * from history. This builds actual finished sessions with actual sets, then lets
 * the real services award what they award.
 *
 * Deliberately NOT wired into DatabaseSeeder. It exists to produce a test
 * account, and seeding a fully-certified member into every fresh database would
 * be misleading — so it is opt-in via `--class=CertifiedMemberSeeder`.
 *
 * Idempotent: the account is reused and its history topped up rather than
 * duplicated, so running it twice does not create 200 sessions.
 */
class CertifiedMemberSeeder extends Seeder
{
    private const EMAIL = 'certified@striv.test';

    /** Sessions needed to clear the top session tier. */
    private const SESSIONS = 105;

    /** Weeks of consecutive training to clear the streak ladder. */
    private const WEEKS = 14;

    /** Distinct exercises that record a personal best. */
    private const PR_EXERCISES = 26;

    /** Sessions inside the CURRENT month, for the consistency milestone. */
    private const MONTH_SESSIONS = 13;

    public function run(): void
    {
        $member = User::firstOrCreate(
            ['email' => self::EMAIL],
            [
                'name' => 'Certified Member',
                'password' => Hash::make('password'),
                'locale' => 'id',
            ],
        );

        /*
         * The profile is not optional.
         *
         * The app gates the member area on `profile.onboarding_completed_at`, so
         * an account without a profile is redirected to /onboarding on every
         * login — which is exactly what happened to the first version of this
         * seeder. The account existed and owned 105 sessions, but could not
         * reach a single page.
         *
         * Only set on creation: re-running must not overwrite a profile the
         * member has since edited.
         */
        Profile::firstOrCreate(
            ['user_id' => $member->id],
            [
                'experience_level' => 'intermediate',
                'primary_goal' => 'build_muscle',
                'training_frequency' => 4,
                'age' => 29,
                'location' => 'Jakarta',
                'weight_kg' => 74.0,
                'height_cm' => 176,
                'target_weight_kg' => 78.0,
                // Without this the member is bounced to onboarding forever.
                'onboarding_completed_at' => now(),
            ],
        );

        /*
         * Already certified: leave the history alone rather than stacking a
         * second copy on top of it.
         *
         * Queried directly rather than through a relation — User has no stats()
         * relation (only UserStat->user() exists), so a relation call here would
         * fail at runtime.
         */
        $alreadyBuilt = \App\Models\UserStat::where('user_id', $member->id)->exists()
            && WorkoutSession::where('user_id', $member->id)->count() >= self::SESSIONS;

        if ($alreadyBuilt) {
            $this->report($member, 'history already present');

            return;
        }

        $exercises = Exercise::orderBy('id')->take(self::PR_EXERCISES)->get();

        if ($exercises->isEmpty()) {
            $this->command?->warn('No exercises found — run ExerciseSeeder first.');

            return;
        }

        $this->command?->info('Building '.self::SESSIONS.' sessions across '.self::WEEKS.' weeks...');
        /*
         * Spread the sessions across consecutive weeks so the streak ladder is
         * satisfied by construction, and fit enough sessions PER WEEK to also
         * clear the 100-session tier.
         *
         * The counts are not arbitrary: the two milestones pull in opposite
         * directions. The streak needs the run to span many weeks, while the
         * session tier needs a large total inside that span. Fitting 100
         * sessions into 14 weeks means roughly 7-8 per week, so each training
         * day carries two sessions (a morning and an evening) rather than one.
         *
         * An earlier version scheduled 3 per week over 14 weeks, which yields
         * ~42 sessions and clears only the streak. That is why this uses a
         * per-day loop and a computed count rather than a fixed day list.
         */
        $made = 0;
        $perWeek = (int) ceil(self::SESSIONS / self::WEEKS);

        // Training days spread through the week; the streak only needs one
        // session in a week, so the extra volume rides on the same days.
        $trainingDays = [1, 2, 4, 5];       // Mon, Tue, Thu, Fri (ISO)

        for ($week = self::WEEKS - 1; $week >= 0 && $made < self::SESSIONS; $week--) {
            $weekStart = now()->subWeeks($week)->startOfWeek();
            $inWeek = 0;

            foreach ($trainingDays as $isoDay) {
                if ($inWeek >= $perWeek || $made >= self::SESSIONS) {
                    break;
                }

                // Two sessions per training day keeps the week's volume high
                // without inventing days that did not happen.
                foreach ([7, 18] as $hour) {
                    if ($made >= self::SESSIONS || $inWeek >= $perWeek) {
                        break;
                    }

                    $date = $weekStart->copy()->addDays($isoDay - 1)->setTime($hour, 0);

                    // Never in the future: the streak rule counts the current
                    // week as live, so today must not be skipped, but tomorrow
                    // must not be claimed.
                    if ($date->isAfter(now())) {
                        continue;
                    }

                    $this->buildSession($member, $date, $exercises->random(min(4, $exercises->count())));
                    $made++;
                    $inWeek++;
                }
            }
        }

        // The current month needs its own density: the consistency milestone
        // counts sessions in the CALENDAR month, and 105 sessions spread across
        // 14 weeks leave only a handful here. Topped up after the main history
        // so it can see which days are already taken.
        $thisMonth = WorkoutSession::where('user_id', $member->id)
            ->whereNotNull('finished_at')
            ->whereBetween('finished_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->count();

        $shortfall = max(0, self::MONTH_SESSIONS - $thisMonth);

        if ($shortfall > 0) {
            $added = $this->topUpCurrentMonth($member, $exercises, $shortfall);
            $this->command?->info("Topped up this month: +{$added} (reached ".self::MONTH_SESSIONS.')');
        }

        $this->report($member, "built {$made} sessions over ".self::WEEKS.' weeks');
    }

    /**
     * Top the CURRENT month up to the consistency threshold.
     *
     * The milestone needs a full month at target frequency, but spreading 105
     * sessions evenly across 14 weeks only lands ~5 in the current month —
     * correct training, wrong month. This adds sessions on the remaining days of
     * the month until the count is met, so the calendar month genuinely holds
     * the required frequency rather than the seeder faking a total.
     *
     * Only days that have already passed are used, and never a day the member
     * has already trained on, so the history stays plausible.
     */
    private function topUpCurrentMonth(User $member, $exercises, int $needed): int
    {
        if ($needed <= 0) {
            return 0;
        }

        $added = 0;
        $cursor = now()->startOfMonth();

        while ($cursor->lte(now()) && $added < $needed) {
            $date = $cursor->copy()->setTime(7, 0);

            $alreadyTrained = WorkoutSession::where('user_id', $member->id)
                ->whereDate('started_at', $date->toDateString())
                ->exists();

            if (! $alreadyTrained) {
                $this->buildSession($member, $date, $exercises->random(min(4, $exercises->count())));
                $added++;
            }

            $cursor->addDay();
        }

        return $added;
    }

    /** One finished session with sets, weight progressing over time. */
    private function buildSession(User $member, \Carbon\Carbon $date, $exercises): void
    {
        $session = WorkoutSession::create([
            'user_id' => $member->id,
            'started_at' => $date,
            'finished_at' => $date->copy()->addMinutes(55),
            'duration_minutes' => 55,
            'notes' => null,
        ]);

        $order = 1;

        foreach ($exercises as $exercise) {
            $we = WorkoutExercise::create([
                'workout_session_id' => $session->id,
                'exercise_id' => $exercise->id,
                'order' => $order++,
            ]);

            /*
             * Weight climbs with how far into the programme the session is, so
             * later sessions are heavier and the record ladder fills naturally.
             *
             * The direction is computed by SUBTRACTION, not with diffInDays or
             * diffInWeeks. Both of those return an absolute value in Carbon, so
             * every session looked equally far from the reference point and the
             * weight came out scrambled — the trend chart ran downward and read
             * as a charting bug when the seeded history itself was incoherent.
             *
             * Subtracting timestamps gives a signed result, so a later date
             * yields a larger number and the progression is monotonic.
             */
            $programmeStart = now()->subWeeks(self::WEEKS - 1)->startOfDay();
            $weeksIn = (int) floor($programmeStart->diffInDays($date, false) / 7);

            // Never negative: a session dated before the window is clamped to
            // the start rather than producing a lighter-than-baseline load.
            $weeksIn = max(0, $weeksIn);

            /*
             * ------------------------------------------------------------------
             * REALISTIC PROGRESSION, NOT A STRAIGHT LINE
             * ------------------------------------------------------------------
             * The trend must rise overall, but a perfectly linear climb is
             * obviously synthetic — real training has good days, flat weeks and
             * deloads. Three effects are layered:
             *
             *   1. TREND — a slow, steady gain per week. This is the signal the
             *      chart is meant to show.
             *
             *   2. DELOAD — every 5th week is lighter. That is standard practice
             *      (accumulate for four weeks, back off on the fifth) and it puts
             *      a visible dip in the chart, which is what makes it read as a
             *      training log rather than a ramp.
             *
             *   3. DAY VARIATION — a small, DETERMINISTIC wobble derived from the
             *      date, so two sessions in the same week are not identical. It
             *      is seeded from the day number rather than randomised, so
             *      re-running the seeder reproduces the same history instead of
             *      producing a different chart every time.
             */
            $trend = $weeksIn * 2.5;

            // Week 5, 10, ... are deload weeks: lighter, as a real block would be.
            $isDeload = $weeksIn > 0 && $weeksIn % 5 === 0;
            $deload = $isDeload ? -6.0 : 0.0;

            // Deterministic day-to-day wobble in the range -2.5 .. +2.5 kg.
            $wobble = (($date->dayOfYear * 7) % 11) / 2 - 2.5;

            // Small per-exercise offset so different movements do not all carry
            // identical numbers.
            $base = 40 + $trend + $deload + $wobble + ($exercise->id % 5);

            foreach ([10, 8, 6] as $i => $reps) {
                WorkoutSet::create([
                    'workout_exercise_id' => $we->id,
                    'set_number' => $i + 1,
                    /*
                     * The LAST set is the heaviest, which is what makes it the
                     * one that sets a record. On a deload week the whole session
                     * is lighter, so it correctly does not produce a PR — that is
                     * the point of a deload, and a seeder that still minted records
                     * on one would misrepresent how the block works.
                     */
                    'weight_kg' => round($base + ($i * 5), 1),
                    'reps' => $reps,
                    'completed_at' => $date->copy()->addMinutes(10 + $i * 3),
                ]);
            }
        }
    }

    /** Award everything the history has earned, then say what was issued. */
    private function report(User $member, string $prefix): void
    {
        /*
         * Personal records are DETECTED, not inserted.
         *
         * PRs are produced by PersonalRecordService::detectForSession(), which
         * compares a session's sets against the member's history and decides
         * what counts as a record (weight, estimated 1RM, volume). Building
         * sessions alone produces none — an earlier version of this seeder
         * created 105 sessions and zero records, because nothing ever ran the
         * detector.
         *
         * Running the real service here rather than fabricating rows means the
         * records are exactly what the production path would produce, including
         * its rules about which set beats which.
         */
        $prService = app(\App\Services\Records\PersonalRecordService::class);
        $recordCount = 0;

        foreach (WorkoutSession::where('user_id', $member->id)->orderBy('started_at')->get() as $session) {
            try {
                $recordCount += count($prService->detectForSession($session));
            } catch (\Throwable $e) {
                $this->command?->warn('  PR detection failed for session '.$session->id.': '.$e->getMessage());
            }
        }

        $badges = app(AchievementService::class)->evaluate($member);
        $certs = app(CertificateService::class)->evaluate($member);

        $this->command?->info($prefix);
        $this->command?->info('  records detected: '.$recordCount);
        $this->command?->info('  badges unlocked : '.count($badges));
        $this->command?->info('  certificates    : '.count($certs));

        foreach ($certs as $c) {
            $this->command?->info('    ['.$c->serial.'] '.$c->milestone);
        }

        $this->command?->info('  login: '.self::EMAIL.' / password');
    }
}
