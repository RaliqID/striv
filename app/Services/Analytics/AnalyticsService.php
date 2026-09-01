<?php

namespace App\Services\Analytics;

use App\Models\Exercise;
use App\Models\PersonalRecord;
use App\Models\User;
use App\Models\WorkoutSession;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Deterministic workout analytics computed from logged sessions.
 *
 * All date windows are UTC. Per-user timezone handling is future scope.
 * All aggregation happens over FINISHED sessions only (finished_at not null).
 */
class AnalyticsService
{
    /** Big-lift slugs used for strength-trend tracking. */
    public const BIG_LIFTS = ['barbell-bench-press', 'squat', 'deadlift', 'overhead-press'];

    public function __construct(public readonly StrengthService $strength)
    {
    }

    /** Total volume of a session: Σ weight_kg × reps (sets missing either value are skipped). */
    public function sessionVolume(WorkoutSession $session): float
    {
        return (float) $session->load('workoutExercises.sets')
            ->workoutExercises->flatMap->sets
            ->whereNotNull('weight_kg')->whereNotNull('reps')
            ->sum(fn ($set) => $set->weight_kg * $set->reps);
    }

    /**
     * Volume aggregated per day (only days with data — frontend fills gaps).
     *
     * @return array<int, array{date: string, volume: float}>
     */
    public function volumeByDay(User $user, CarbonInterface $from, CarbonInterface $to): array
    {
        return $this->volumeAggregated($user, $from, $to, 'day');
    }

    /**
     * Volume aggregated per ISO week for the last N weeks (week starts Monday).
     *
     * @return array<int, array{week_start: string, volume: float}>
     */
    public function volumeByWeek(User $user, int $weeks): array
    {
        $start = Carbon::now()->startOfWeek()->subWeeks($weeks - 1)->startOfDay();
        $rows = $this->volumeAggregated($user, $start, Carbon::now(), 'week');

        // Fill forward empty weeks so the frontend chart has a continuous axis.
        $byWeek = collect($rows)->keyBy('week_start');
        $weeksOut = [];

        for ($i = $weeks - 1; $i >= 0; $i--) {
            $monday = Carbon::now()->startOfWeek()->subWeeks($i)->toDateString();
            $weeksOut[] = ['week_start' => $monday, 'volume' => $byWeek[$monday]['volume'] ?? 0.0];
        }

        return $weeksOut;
    }

    /**
     * Sessions containing a given exercise: count, total volume, best set,
     * and best estimated 1RM in the last 30 days.
     */
    public function exerciseSummary(User $user, Exercise $exercise): array
    {
        $sets = DB::table('workout_exercises as we')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->join('workout_sets as s', 's.workout_exercise_id', '=', 'we.id')
            ->where('ws.user_id', $user->id)
            ->where('we.exercise_id', $exercise->id)
            ->orderBy('ws.started_at')
            ->get([
                'ws.id as session_id',
                'ws.started_at',
                'ws.finished_at',
                's.weight_kg',
                's.reps',
            ]);

        $sessionIds = $sets->pluck('session_id')->unique();
        $totalVolume = 0.0;
        $best = null;
        $latestE1rm = null;
        $latestE1rmDate = null;

        foreach ($sets as $row) {
            $weight = $row->weight_kg !== null ? (float) $row->weight_kg : null;
            $reps = $row->reps !== null ? (int) $row->reps : null;

            if ($weight !== null && $reps !== null) {
                $totalVolume += $weight * $reps;

                if ($best === null || $weight > $best['weight'] || ($weight === $best['weight'] && ($reps > $best['reps']))) {
                    $best = [
                        'weight' => $weight,
                        'reps' => $reps,
                        'e1rm' => StrengthService::estimated1rm($weight, $reps),
                        'date' => Carbon::parse($row->started_at)->toDateString(),
                    ];
                }

                $e1rm = StrengthService::estimated1rm($weight, $reps);
                if ($e1rm !== null) {
                    $rowDate = Carbon::parse($row->started_at);
                    if ($rowDate->gte(Carbon::now()->subDays(30)) && ($latestE1rm === null || $e1rm > $latestE1rm)) {
                        $latestE1rm = $e1rm;
                        $latestE1rmDate = $rowDate->toDateString();
                    }
                }
            }
        }

        return [
            'sessions' => $sessionIds->count(),
            'total_volume' => round($totalVolume, 2),
            'best' => $best,
            'latest_e1rm' => $latestE1rm,
            'latest_e1rm_date' => $latestE1rmDate,
        ];
    }

    /**
     * Finished-session count per ISO week for the last N weeks.
     *
     * @return array<int, array{week_start: string, workouts: int}>
     */
    public function frequencyWeekly(User $user, int $weeks): array
    {
        $start = Carbon::now()->startOfWeek()->subWeeks($weeks - 1)->startOfDay();

        $counts = WorkoutSession::query()
            ->where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->where('started_at', '>=', $start)
            ->get(['started_at'])
            ->groupBy(fn ($s) => $s->started_at->copy()->startOfWeek()->toDateString());

        $out = [];
        for ($i = $weeks - 1; $i >= 0; $i--) {
            $monday = Carbon::now()->startOfWeek()->subWeeks($i)->toDateString();
            $out[] = ['week_start' => $monday, 'workouts' => $counts->get($monday, collect())->count()];
        }

        return $out;
    }

    /**
     * Adherence to profile target training frequency. Null when profile has
     * no frequency or user logged zero finished sessions in window.
     */
    public function consistencyScore(User $user, int $weeks = 4): ?array
    {
        $target = $user->profile?->training_frequency;
        if (!$target) {
            return null;
        }

        $start = Carbon::now()->startOfWeek()->subWeeks($weeks - 1)->startOfDay();
        $count = WorkoutSession::query()
            ->where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->where('started_at', '>=', $start)
            ->count();

        if ($count === 0) {
            return null;
        }

        $avg = $count / $weeks;

        return [
            'target_days' => (int) $target,
            'avg_sessions_per_week' => round($avg, 2),
            'adherence_pct' => round(min(100, $avg / $target * 100), 1),
        ];
    }

    /**
     * Everything the Dashboard screen needs in one deterministic payload.
     */
    public function dashboardOverview(User $user): array
    {
        $now = Carbon::now();
        $last30 = $now->copy()->subDays(30)->startOfDay();
        $prev30 = $now->copy()->subDays(60)->startOfDay();
        $trendFrom = $now->copy()->subDays(90)->startOfDay();

        $last30Sessions = $this->finishedSessionsBetween($user, $last30, $now);
        $prev30Sessions = $this->finishedSessionsBetween($user, $prev30, $last30);

        $setsLast30 = 0;
        $volumeLast30 = 0.0;
        foreach ($last30Sessions as $session) {
            $setsLast30 += $session->workoutExercises->sum(fn ($we) => $we->sets->count());
            $volumeLast30 += $this->sessionVolume($session);
        }

        $volumePrev30 = 0.0;
        foreach ($prev30Sessions as $session) {
            $volumePrev30 += $this->sessionVolume($session);
        }

        return [
            'workouts_last_30d' => $last30Sessions->count(),
            'sets_last_30d' => $setsLast30,
            'volume_last_30d' => round($volumeLast30, 2),
            'volume_prev_30d' => round($volumePrev30, 2),
            'strength_trend_pct' => $this->strength->bigLiftTrendPct($user, $trendFrom, $now, self::BIG_LIFTS),
            'recent_prs' => PersonalRecord::where('user_id', $user->id)
                ->latest('achieved_at')
                ->limit(5)
                ->get()
                ->all(),
            'weekly_volume' => $this->volumeByWeek($user, 8),
        ];
    }

    /**
     * @return array<int, array{date: string, volume: float}|array{week_start: string, volume: float}>
     */
    private function volumeAggregated(User $user, CarbonInterface $from, CarbonInterface $to, string $unit): array
    {
        $rows = DB::table('workout_exercises as we')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->join('workout_sets as s', 's.workout_exercise_id', '=', 'we.id')
            ->where('ws.user_id', $user->id)
            ->whereNotNull('ws.finished_at')
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->whereBetween('ws.started_at', [$from, $to])
            ->get(['ws.started_at', 's.weight_kg', 's.reps']);

        $grouped = $rows->groupBy(function ($row) use ($unit) {
            $date = Carbon::parse($row->started_at);
            return $unit === 'week' ? $date->copy()->startOfWeek()->toDateString() : $date->toDateString();
        });

        return $grouped->map(function ($dayRows, $key) use ($unit) {
            return [
                ($unit === 'week' ? 'week_start' : 'date') => $key,
                'volume' => round($dayRows->sum(fn ($r) => $r->weight_kg * $r->reps), 2),
            ];
        })->values()->all();
    }

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, WorkoutSession>
     */
    private function finishedSessionsBetween(User $user, CarbonInterface $from, CarbonInterface $to)
    {
        return WorkoutSession::query()
            ->where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->whereBetween('started_at', [$from, $to])
            ->with(['workoutExercises.sets'])
            ->get();
    }
}
