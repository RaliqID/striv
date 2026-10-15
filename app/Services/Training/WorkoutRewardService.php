<?php

namespace App\Services\Training;

use App\Models\PersonalRecord;
use App\Models\User;
use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Builds the "you just finished a workout" reward screen.
 *
 * A finished session previously returned three raw numbers — exercises, sets,
 * volume — and nothing else. That is a data readout, not a reward: it gives the
 * member no reason to feel anything, and no reason to come back tomorrow. This
 * turns the same session into the four things that actually produce that
 * feeling:
 *
 *   PRs        — "Bench press 45kg -> 47.5kg", the single strongest signal
 *   Streak     — "3 weeks running", which makes skipping feel like a loss
 *   Comparison — "+12% volume vs last week", so the number has a reference
 *   AI praise  — one personalised sentence, from a coach rather than a chart
 *
 * Everything here is computed from data that already exists; nothing is
 * invented. If there is no PR, no streak and no prior week, those blocks are
 * omitted rather than filled with empty encouragement.
 */
class WorkoutRewardService
{
    /** Sessions within this many days count toward a consecutive-day streak. */
    private const STREAK_WINDOW_DAYS = 30;

    public function __construct(
        private readonly \App\Services\AI\AIInsightService $ai,
    ) {
    }

    /**
     * Everything the reward screen renders, for one finished session.
     *
     * @return array{
     *   summary: array<string, mixed>,
     *   personal_records: array<int, array<string, mixed>>,
     *   streak: array<string, mixed>,
     *   comparison: array<string, mixed>|null,
     *   praise: string|null,
     *   has_reward: bool
     * }
     */
    public function forSession(WorkoutSession $session): array
    {
        $member = $session->user;

        $summary = $this->summary($session);
        $prs = $this->personalRecords($session);
        $streak = $this->streak($member, $session);
        $comparison = $this->comparison($member, $session);

        /*
         * The AI line is generated last and is allowed to fail: a provider
         * outage must not blank the screen. The other three blocks are computed
         * from the database and always render.
         */
        $praise = $this->praise($member, $summary, $prs, $streak, $comparison);

        $hasReward = $prs !== []
            || ($streak['current'] ?? 0) >= 2
            || $comparison !== null
            || $praise !== null;

        return [
            'summary' => $summary,
            'personal_records' => $prs,
            'streak' => $streak,
            'comparison' => $comparison,
            'praise' => $praise,
            'has_reward' => $hasReward,
        ];
    }

    /**
     * The session's own numbers, plus what the member actually completed.
     *
     * `proven_sets` counts only sets with accepted photo evidence, so the screen
     * can distinguish "logged" from "evidenced" — the member sees the effort
     * they can actually account for.
     *
     * @return array<string, mixed>
     */
    private function summary(WorkoutSession $session): array
    {
        $session->loadMissing(['workoutExercises.exercise', 'workoutExercises.sets.photo']);

        $sets = $session->workoutExercises->flatMap->sets;

        $volume = $sets
            ->filter(fn (WorkoutSet $s) => $s->weight_kg !== null && $s->reps !== null)
            ->sum(fn (WorkoutSet $s) => (float) $s->weight_kg * (int) $s->reps);

        return [
            'exercises' => $session->workoutExercises->count(),
            'sets' => $sets->count(),
            'proven_sets' => $sets->filter(fn (WorkoutSet $s) => $s->isProven())->count(),
            'volume_kg' => round((float) $volume, 2),
            'duration_minutes' => $session->duration_minutes !== null
                ? (int) $session->duration_minutes
                : null,
            'finished_at' => $session->finished_at?->toIso8601String(),
        ];
    }

    /**
     * PRs set in this session, with the value each one replaced.
     *
     * `previous_value` is read from the PR row rather than re-derived: the row
     * is updated in place when beaten, so the old value is only available
     * because the recorder stored it at that moment (see
     * PersonalRecordService::upsertPr).
     *
     * The delta is what makes it a reward: "20kg" means nothing on its own,
     * "20kg, up from 10kg" is the thing the member notices.
     *
     * @return array<int, array<string, mixed>>
     */
    private function personalRecords(WorkoutSession $session): array
    {
        $records = PersonalRecord::where('workout_session_id', $session->id)
            ->with('exercise')
            ->get();

        return $records->map(function (PersonalRecord $pr) {
            $previous = $pr->previous_value !== null ? (float) $pr->previous_value : null;

            return [
                'id' => $pr->id,
                'exercise_id' => $pr->exercise_id,
                'exercise_name' => $pr->exercise?->name,
                'type' => $pr->pr_type,
                'value' => (float) $pr->value,
                'previous_value' => $previous,
                // Null when this is the very first record for the exercise —
                // there is no gain to show, and inventing one would be a lie.
                'delta' => $previous !== null ? round((float) $pr->value - $previous, 2) : null,
                'is_first' => $previous === null,
            ];
        })->values()->all();
    }


    /**
     * Consecutive weeks in which the member trained at least once.
     *
     * Measured in weeks, not days: a member who trains Mon/Wed/Fri is not on a
     * "broken streak" on Tuesday, and a day-based counter would tell them they
     * were. Weeks are what a training plan is actually organised around.
     *
     * @return array<string, mixed>
     */
    private function streak(User $member, WorkoutSession $session): array
    {
        $weeks = DB::table('workout_sessions')
            ->where('user_id', $member->id)
            ->whereNotNull('finished_at')
            ->where('finished_at', '>=', now()->subDays(self::STREAK_WINDOW_DAYS))
            ->orderByDesc('finished_at')
            ->pluck('finished_at')
            ->map(fn ($ts) => Carbon::parse($ts)->startOfWeek()->toDateString())
            ->unique()
            ->values();

        // Walk back from this session's week, counting until a gap.
        $current = 0;
        $cursor = $session->finished_at !== null
            ? Carbon::parse($session->finished_at)->startOfWeek()
            : now()->startOfWeek();

        foreach ($weeks as $week) {
            if (Carbon::parse($week)->equalTo($cursor)) {
                $current++;
                $cursor->subWeek();
            } elseif (Carbon::parse($week)->lt($cursor)) {
                break;
            }
        }

        return [
            'current' => $current,
            'this_week_count' => DB::table('workout_sessions')
                ->where('user_id', $member->id)
                ->whereNotNull('finished_at')
                ->whereBetween('finished_at', [now()->startOfWeek(), now()->endOfWeek()])
                ->count(),
            'is_record' => $current >= 3,
        ];
    }

    /**
     * This session against the same period last week.
     *
     * Returns null when there is no prior week to compare with, so the member
     * never sees "+0%" or "+100%" against an empty baseline.
     *
     * @return array<string, mixed>|null
     */
    private function comparison(User $member, WorkoutSession $session): ?array
    {
        $thisVolume = $this->volumeFor($session);

        $lastWeekStart = now()->subWeek()->startOfWeek();
        $lastWeekEnd = now()->subWeek()->endOfWeek();

        $lastWeekVolume = (float) DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.user_id', $member->id)
            ->whereNotNull('ws.finished_at')
            ->whereBetween('ws.finished_at', [$lastWeekStart, $lastWeekEnd])
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->selectRaw('COALESCE(SUM(s.weight_kg * s.reps), 0) as volume')
            ->value('volume');

        if ($lastWeekVolume <= 0) {
            return null;
        }

        $pct = (($thisVolume - $lastWeekVolume) / $lastWeekVolume) * 100;

        return [
            'this_session_volume_kg' => round($thisVolume, 2),
            'last_week_volume_kg' => round($lastWeekVolume, 2),
            'delta_pct' => round($pct, 1),
            'direction' => $pct > 0 ? 'up' : ($pct < 0 ? 'down' : 'flat'),
        ];
    }

    private function volumeFor(WorkoutSession $session): float
    {
        return (float) $session->workoutExercises->flatMap->sets
            ->filter(fn (WorkoutSet $s) => $s->weight_kg !== null && $s->reps !== null)
            ->sum(fn (WorkoutSet $s) => (float) $s->weight_kg * (int) $s->reps);
    }

    /**
     * Collapse the raw PR rows into the ONE record per exercise the UI headlines.
     *
     * A single session can produce several PR rows for the same exercise
     * (weight, estimated 1RM, session volume). The reward card renders only one
     * of them — see `groupRecordsByExercise()` in
     * frontend/components/workout/WorkoutReward.tsx — using the rule: prefer the
     * `weight` record; fall back to the first row seen.
     *
     * This mirrors that rule so the AI describes the same figure the card shows.
     * The `weight` type is preferred because it is the number the member can
     * picture ("I benched 100kg"); an estimated 1RM is derived from reps and is
     * a weight they never actually lifted, so it must not be the figure quoted
     * back to them.
     *
     * An exercise that only has a `one_rm` row keeps that row as its headline —
     * it is not dropped.
     *
     * @param  array<int, array<string, mixed>>  $prs
     * @return array<int, array<string, mixed>>
     */
    private function headlineRecords(array $prs): array
    {
        $headlines = [];

        foreach ($prs as $pr) {
            $exerciseId = $pr['exercise_id'];

            if (! isset($headlines[$exerciseId])) {
                $headlines[$exerciseId] = $pr;
                continue;
            }

            // Prefer the weight record as the headline; fall back to the first.
            if ($pr['type'] === 'weight' && $headlines[$exerciseId]['type'] !== 'weight') {
                $headlines[$exerciseId] = $pr;
            }
        }

        return array_values($headlines);
    }

    /**
     * One personalised sentence, written by the AI from real session facts.
     *
     * Prompted with the actual numbers and told to reference them, because a
     * generic "great job!" is worse than nothing — it reads as automated and
     * makes every other message on the screen feel automated too.
     *
     * Returns null on any failure; the reward screen still shows the computed
     * blocks.
     *
     * @param  array<int, array<string, mixed>>  $prs
     * @param  array<string, mixed>  $streak
     * @param  array<string, mixed>|null  $comparison
     */
    private function praise(
        User $member,
        array $summary,
        array $prs,
        array $streak,
        ?array $comparison,
    ): ?string {
        $locale = $member->locale ?? 'en';

        /*
         * Only the HEADLINE record per exercise is sent to the model, not every
         * PR row.
         *
         * Feeding the raw list lets the model pick whichever figure looks most
         * flattering — in practice the estimated 1RM, which is bigger — and it
         * then quotes a number that contradicts the PR card standing next to the
         * praise line on the same screen. The member sees two different "personal
         * records" at once and stops trusting either.
         *
         * The headline rule is the UI's own rule, so the sentence the coach
         * writes and the card the member reads are always the same record. An
         * estimated 1RM is a derived figure the member never actually lifted, so
         * it cannot be the record quoted back to them.
         */
        $headlines = $this->headlineRecords($prs);

        $facts = [
            'locale' => $locale,
            'exercises' => $summary['exercises'],
            'sets' => $summary['sets'],
            'volume_kg' => $summary['volume_kg'],
            'personal_records' => array_map(fn ($p) => [
                'exercise' => $p['exercise_name'],
                'value' => $p['value'],
                'previous' => $p['previous_value'],
            ], $headlines),
            'streak_weeks' => $streak['current'],
            /*
             * Only the UPWARD comparison is passed to the model.
             *
             * The raw delta was previously sent in both directions, and the
             * model dutifully reported the bad news inside what is supposed to
             * be a reward: "...great dedication, even though your volume is down
             * 92.9%". That turns the celebration into a critique at the exact
             * moment the member should feel good.
             *
             * A decline is still shown on the dashboard and progress screens,
             * where the member is in an analytical frame of mind. Here the
             * screen has one job.
             */
            'volume_vs_last_week_pct' => ($comparison !== null && ($comparison['delta_pct'] ?? 0) > 0)
                ? $comparison['delta_pct']
                : null,
            'primary_goal' => $member->profile?->primary_goal,
        ];

        $system = <<<'PROMPT'
        You are the member's personal trainer, speaking to them immediately after they finished a workout.

        Write ONE sentence of genuine, specific encouragement, then stop. Rules:
        - Reference the actual facts given. If they set a personal record, name the exercise and the weight.
        - If they have a training streak, acknowledge it.
        - NEVER mention a decline, a drop, a missed session, or anything negative. This message is a reward,
          not a review — if the data contains no positive fact, simply acknowledge the work they just did.
        - Do NOT use exclamation-mark spam, do NOT say "great job" or "well done" generically, and do NOT
          invent facts that are not in the data.
        - Reply in the language whose code is in the "locale" field. "id" means Bahasa Indonesia, "en" means English.
        - Output the sentence only. No JSON, no quotes, no preamble.

        Example of the register to aim for (in English): "Bench press up to 47.5kg from 45 — that is three
        weeks of steady work paying off."
        PROMPT;

        try {
            $provider = $this->ai->provider();

            if ($provider === null) {
                return null;
            }

            $reply = $provider->chat([
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => json_encode($facts, JSON_UNESCAPED_UNICODE)],
            ], ['max_tokens' => 300, 'temperature' => 0.5]);

            if ($reply === null) {
                return null;
            }

            $clean = trim($reply);

            // Guard against a model that ignores the format instruction: if it
            // returned JSON or a wall of text, show nothing rather than garbage.
            if ($clean === '' || str_starts_with($clean, '{') || mb_strlen($clean) > 400) {
                return null;
            }

            return $clean;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('WorkoutRewardService: praise failed', [
                'user_id' => $member->id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
