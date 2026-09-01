<?php

namespace App\Services\Patterns;

use App\Models\AiInsight;
use App\Models\Exercise;
use App\Models\User;
use App\Models\WorkoutSession;
use App\Services\Analytics\AnalyticsService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Deterministic training-pattern detection (no LLM).
 *
 * Runs rule-based detectors over a user's logged data and returns patterns
 * as plain arrays. Persistence is the AI layer's job (later task) — except
 * milestone dedup, which consults existing ai_insights rows to avoid repeats.
 *
 * Confidence methodology (0–1):
 *  - Data volume: more sessions in window → higher confidence.
 *  - Trend strength: linear-regression R² rewards consistent, not noisy, trends.
 *  - Fact purity: purely factual patterns (milestones) get near-max confidence.
 */
class PatternDetectionService
{
    // === Threshold constants (documented, deterministic) ===

    /** Big lifts tracked for strength patterns. */
    protected const BIG_LIFTS = AnalyticsService::BIG_LIFTS;

    /** Look-back window for strength-trend detectors (days). */
    protected const STRENGTH_WINDOW_DAYS = 90;

    /** Minimum sessions for progress/regression detection. */
    protected const TREND_MIN_SESSIONS = 4;

    /** Minimum session span (days) for progress/regression. */
    protected const TREND_MIN_SPAN_DAYS = 21; // ≥3 weeks

    /** Minimum sessions for plateau detection. */
    protected const PLATEAU_MIN_SESSIONS = 6;

    /** Minimum session span (days) for plateau. */
    protected const PLATEAU_MIN_SPAN_DAYS = 28; // ≥4 weeks

    /** Relative e1rm change (%) considered meaningful progress. */
    protected const PROGRESS_PCT = 5.0;

    /** Relative e1rm change (%) considered meaningful regression. */
    protected const REGRESSION_PCT = -5.0;

    /** Relative e1rm change (%) under which we call it flat. */
    protected const PLATEAU_PCT = 2.0;

    /** Flat weekly slope threshold, as % of mean e1rm per week. */
    protected const PLATEAU_SLOPE_PCT_PER_WEEK = 0.25;

    /** Volume detector: comparison window (weeks per half). */
    protected const VOLUME_HALF_WEEKS = 8;

    /** Volume detector: minimum non-zero weeks per half. */
    protected const VOLUME_MIN_ACTIVE_WEEKS = 3;

    /** Volume detector: total change threshold (%). */
    protected const VOLUME_CHANGE_PCT = 20.0;

    /** Consistency detector: adherence delta threshold (percentage points). */
    protected const CONSISTENCY_DELTA_PP = 15.0;

    /** Consistency detector: minimum sessions per 4-week window. */
    protected const CONSISTENCY_MIN_SESSIONS = 2;

    /** Total-session milestone thresholds. */
    protected const MILESTONES = [10, 25, 50, 100];

    public function __construct(protected readonly AnalyticsService $analytics)
    {
    }

    /**
     * Run all detectors. Returns pattern arrays (never throws on empty data).
     *
     * @return array<int, array{type: string, exercise_slug: ?string, title: string, summary: string, evidence: array, confidence: float, window: array}>
     */
    public function detect(User $user): array
    {
        return array_merge(
            $this->detectProgress($user),
            $this->detectPlateau($user),
            $this->detectRegression($user),
            $this->detectVolumeChange($user),
            $this->detectConsistencyChange($user),
            $this->detectMilestones($user),
        );
    }

    /**
     * Upward strength trend per big lift: slope > 0 and first→last e1rm ≥ +5%.
     */
    public function detectProgress(User $user): array
    {
        $patterns = [];

        foreach ($this->bigLiftData($user) as $data) {
            if ($data['sessions'] < self::TREND_MIN_SESSIONS || $data['span_days'] < self::TREND_MIN_SPAN_DAYS) {
                continue;
            }
            if (!($data['slope'] > 0) || $data['pct_change'] < self::PROGRESS_PCT) {
                continue;
            }

            $patterns[] = $this->strengthPattern($data, 'progress', "{$data['name']} strength is trending upward", function () use ($data) {
                return "Estimated 1RM increased {$data['pct_change']}% over {$data['weeks']} weeks.";
            }, 0.1);
        }

        return $patterns;
    }

    /**
     * Plateau per big lift: |first→last e1rm| < 2% (or flat slope with R² ≥ 0.4).
     */
    public function detectPlateau(User $user): array
    {
        $patterns = [];

        foreach ($this->bigLiftData($user) as $data) {
            if ($data['sessions'] < self::PLATEAU_MIN_SESSIONS || $data['span_days'] < self::PLATEAU_MIN_SPAN_DAYS) {
                continue;
            }

            $pct = abs($data['pct_change']);
            $flatSlope = $data['mean'] > 0
                && abs($data['slope']) / 7 / $data['mean'] * 100 < self::PLATEAU_SLOPE_PCT_PER_WEEK
                && $data['r2'] >= 0.4;

            if (!($pct < self::PLATEAU_PCT || $flatSlope)) {
                continue;
            }

            $patterns[] = $this->strengthPattern($data, 'plateau', "{$data['name']} performance has plateaued", function () use ($data, $pct) {
                return "Estimated 1RM has stayed within {$pct}% over the last {$data['weeks']} weeks.";
            }, 0.08, 0.85);
        }

        return $patterns;
    }

    /**
     * Strength regression per big lift: slope < 0 and first→last e1rm ≤ -5%.
     */
    public function detectRegression(User $user): array
    {
        $patterns = [];

        foreach ($this->bigLiftData($user) as $data) {
            if ($data['sessions'] < self::TREND_MIN_SESSIONS || $data['span_days'] < self::TREND_MIN_SPAN_DAYS) {
                continue;
            }
            if (!($data['slope'] < 0) || $data['pct_change'] > self::REGRESSION_PCT) {
                continue;
            }

            $patterns[] = $this->strengthPattern($data, 'regression', "{$data['name']} strength is declining", function () use ($data) {
                return "Estimated 1RM decreased " . abs($data['pct_change']) . "% over {$data['weeks']} weeks.";
            }, 0.1);
        }

        return $patterns;
    }

    /**
     * Total-volume shift: last 8 weeks vs previous 8 weeks, ≥ ±20%.
     */
    public function detectVolumeChange(User $user): array
    {
        $weeks = $this->analytics->volumeByWeek($user, self::VOLUME_HALF_WEEKS * 2);
        $recent = array_slice($weeks, self::VOLUME_HALF_WEEKS);
        $previous = array_slice($weeks, 0, self::VOLUME_HALF_WEEKS);

        $recentActive = count(array_filter($recent, fn ($w) => $w['volume'] > 0));
        $previousActive = count(array_filter($previous, fn ($w) => $w['volume'] > 0));
        if ($recentActive < self::VOLUME_MIN_ACTIVE_WEEKS || $previousActive < self::VOLUME_MIN_ACTIVE_WEEKS) {
            return [];
        }

        $recentTotal = array_sum(array_column($recent, 'volume'));
        $previousTotal = array_sum(array_column($previous, 'volume'));
        if ($previousTotal <= 0) {
            return [];
        }

        $pct = ($recentTotal - $previousTotal) / $previousTotal * 100;
        $windowStart = $previous[0]['week_start'];

        if ($pct >= self::VOLUME_CHANGE_PCT) {
            return [$this->pattern('volume_change', null, 'Training volume increased',
                "Weekly volume up " . round($pct, 1) . "% compared with the previous period.",
                ['recent_total' => round($recentTotal, 2), 'previous_total' => round($previousTotal, 2), 'pct' => round($pct, 1)],
                0.6, $windowStart)];
        }

        if ($pct <= -self::VOLUME_CHANGE_PCT) {
            return [$this->pattern('volume_change', null, 'Training volume decreased',
                "Weekly volume down " . abs(round($pct, 1)) . "% compared with the previous period.",
                ['recent_total' => round($recentTotal, 2), 'previous_total' => round($previousTotal, 2), 'pct' => round($pct, 1)],
                0.6, $windowStart)];
        }

        return [];
    }

    /**
     * Adherence shift: last 4 weeks vs previous 4 weeks, ≥ ±15 percentage points.
     */
    public function detectConsistencyChange(User $user): array
    {
        $target = $user->profile?->training_frequency;
        if (!$target) {
            return [];
        }

        $weeks = $this->analytics->frequencyWeekly($user, 8);
        $recent = array_slice($weeks, 4);
        $previous = array_slice($weeks, 0, 4);

        $recentSessions = array_sum(array_column($recent, 'workouts'));
        $previousSessions = array_sum(array_column($previous, 'workouts'));
        if ($recentSessions < self::CONSISTENCY_MIN_SESSIONS || $previousSessions < self::CONSISTENCY_MIN_SESSIONS) {
            return [];
        }

        $adherence = fn (int $sessions) => round(min(100, ($sessions / 4) / $target * 100), 1);
        $recentPct = $adherence($recentSessions);
        $previousPct = $adherence($previousSessions);
        $delta = $recentPct - $previousPct;
        $windowStart = $previous[0]['week_start'];

        if ($delta >= self::CONSISTENCY_DELTA_PP) {
            return [$this->pattern('consistency', null, 'Training consistency improved',
                "Adherence rose from {$previousPct}% to {$recentPct}% of your weekly target.",
                ['recent_adherence_pct' => $recentPct, 'previous_adherence_pct' => $previousPct, 'delta_pp' => round($delta, 1), 'target_per_week' => (int) $target],
                0.65, $windowStart)];
        }

        if ($delta <= -self::CONSISTENCY_DELTA_PP) {
            return [$this->pattern('consistency', null, 'Training consistency declined',
                "Adherence dropped from {$previousPct}% to {$recentPct}% of your weekly target.",
                ['recent_adherence_pct' => $recentPct, 'previous_adherence_pct' => $previousPct, 'delta_pp' => round($delta, 1), 'target_per_week' => (int) $target],
                0.65, $windowStart)];
        }

        return [];
    }

    /**
     * Total finished-session milestones (10/25/50/100). Skips thresholds already
     * recorded as milestone insights so they fire once per threshold.
     */
    public function detectMilestones(User $user): array
    {
        $total = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->count();

        if ($total === 0) {
            return [];
        }

        $firstSession = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->orderBy('started_at')
            ->value('started_at');

        $patterns = [];
        foreach (self::MILESTONES as $threshold) {
            if ($total < $threshold) {
                continue;
            }

            $alreadyRecorded = AiInsight::where('user_id', $user->id)
                ->where('type', 'milestone')
                ->where('evidence', 'like', '%"total_sessions":' . $threshold . '%')
                ->exists();
            if ($alreadyRecorded) {
                continue;
            }

            $patterns[] = $this->pattern('milestone', null, "{$threshold} workouts completed",
                "You've logged {$threshold} total training sessions.",
                ['total_sessions' => $threshold],
                0.95,
                optional($firstSession)->toDateString() ?? now()->toDateString());
        }

        return $patterns;
    }

    // === Helpers ===

    /**
     * @return array<int, array{slug: string, name: string, sessions: int, span_days: int, weeks: int, slope: float, r2: float, mean: float, pct_change: float, first_e1rm: float, last_e1rm: float, first_date: string, last_date: string}>
     */
    private function bigLiftData(User $user): array
    {
        $from = Carbon::now()->subDays(self::STRENGTH_WINDOW_DAYS)->startOfDay();
        $to = Carbon::now();
        $out = [];

        foreach (self::BIG_LIFTS as $slug) {
            $exercise = Exercise::where('slug', $slug)->first();
            if (!$exercise) {
                continue;
            }

            $points = $this->analytics->strength->bestSetPerSession($user, $exercise, $from, $to);
            if (count($points) < 2) {
                continue;
            }

            $regression = $this->linearRegression($points);
            $spanDays = $regression['span_days'];

            $out[] = [
                'slug' => $slug,
                'name' => $exercise->name,
                'sessions' => count($points),
                'span_days' => $spanDays,
                'weeks' => max(1, (int) round($spanDays / 7)),
                'slope' => $regression['slope'],
                'r2' => $regression['r2'],
                'mean' => $regression['mean'],
                'pct_change' => $regression['pct_change'],
                'first_e1rm' => $points[0]['e1rm'],
                'last_e1rm' => $points[count($points) - 1]['e1rm'],
                'first_date' => $points[0]['date'],
                'last_date' => $points[count($points) - 1]['date'],
            ];
        }

        return $out;
    }

    /**
     * Least-squares regression over e1rm points (x = days since first point).
     *
     * @param array<int, array{date: string, e1rm: float}> $points
     * @return array{slope: float, intercept: float, r2: float, mean: float, pct_change: float, span_days: int}
     */
    private function linearRegression(array $points): array
    {
        $firstDate = Carbon::parse($points[0]['date'])->startOfDay();

        $xs = [];
        $ys = [];
        foreach ($points as $p) {
            $xs[] = Carbon::parse($p['date'])->startOfDay()->diffInDays($firstDate);
            $ys[] = $p['e1rm'];
        }

        $n = count($points);
        $meanX = array_sum($xs) / $n;
        $meanY = array_sum($ys) / $n;

        $num = 0.0;
        $denX = 0.0;
        $denY = 0.0;
        for ($i = 0; $i < $n; $i++) {
            $dx = $xs[$i] - $meanX;
            $dy = $ys[$i] - $meanY;
            $num += $dx * $dy;
            $denX += $dx * $dx;
            $denY += $dy * $dy;
        }

        $slope = $denX > 0 ? $num / $denX : 0.0;
        $intercept = $meanY - $slope * $meanX;
        $r = ($denX > 0 && $denY > 0) ? $num / sqrt($denX * $denY) : 0.0;
        $r2 = $r * $r;

        $first = $ys[0];
        $last = $ys[$n - 1];
        $pctChange = $first > 0 ? ($last - $first) / $first * 100 : 0.0;

        return [
            'slope' => round($slope, 4),
            'intercept' => round($intercept, 4),
            'r2' => round($r2, 4),
            'mean' => round($meanY, 2),
            'pct_change' => round($pctChange, 2),
            'span_days' => (int) ($xs[$n - 1] - $xs[0]),
        ];
    }

    /**
     * Assemble a strength-trend pattern with confidence from data volume + R².
     *
     * @param array $data @see bigLiftData()
     */
    private function strengthPattern(array $data, string $type, string $title, \Closure $summary, float $stepPerExtraSession, float $cap = 0.9): array
    {
        $minSessions = $type === 'plateau' ? self::PLATEAU_MIN_SESSIONS : self::TREND_MIN_SESSIONS;
        $confidence = 0.5 + $stepPerExtraSession * max(0, $data['sessions'] - $minSessions);
        if ($data['r2'] >= 0.5) {
            $confidence += 0.05;
        }
        $confidence = min($cap, $confidence);

        return $this->pattern(
            $type,
            $data['slug'],
            $title,
            $summary(),
            [
                'exercise' => $data['slug'],
                'sessions_analyzed' => $data['sessions'],
                'first_e1rm' => $data['first_e1rm'],
                'last_e1rm' => $data['last_e1rm'],
                'pct_change' => $data['pct_change'],
                'weeks' => $data['weeks'],
                'slope' => $data['slope'],
                'r2' => $data['r2'],
            ],
            $confidence,
            Carbon::now()->subDays(self::STRENGTH_WINDOW_DAYS)->toDateString(),
            $data['last_date'],
        );
    }

    /**
     * Uniform pattern shape factory.
     */
    private function pattern(string $type, ?string $exerciseSlug, string $title, string $summary, array $evidence, float $confidence, string $windowStart, ?string $windowEnd = null): array
    {
        return [
            'type' => $type,
            'exercise_slug' => $exerciseSlug,
            'title' => $title,
            'summary' => $summary,
            'evidence' => $evidence,
            'confidence' => round($confidence, 2),
            'window' => [
                'start' => $windowStart,
                'end' => $windowEnd ?? now()->toDateString(),
            ],
        ];
    }
}
