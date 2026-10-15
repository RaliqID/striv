<?php

namespace App\Services\Analytics;

use App\Models\Exercise;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Strength metrics derived from logged sets.
 *
 * All timestamps are treated as UTC. Per-user timezone support is future scope.
 */
class StrengthService
{
    /**
     * Estimated 1RM via Epley formula: weight × (1 + reps/30).
     *
     * Returns null when inputs are non-positive, or reps > 12
     * (Epley is unreliable above ~12 reps — such sets are excluded).
     */
    public static function estimated1rm(float $weight, int $reps): ?float
    {
        if ($weight <= 0 || $reps <= 0 || $reps > 12) {
            return null;
        }

        return round($weight * (1 + $reps / 30), 2);
    }

    /**
     * Per finished session, the best set (max estimated 1RM) for a given
     * exercise. Ordered by session date ascending.
     *
     * @return array<int, array{session_id: int, date: string, e1rm: float, weight: float, reps: int}>
     */
    public function bestSetPerSession(User $user, Exercise $exercise, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        /*
         * The date window is applied IN SQL, not afterwards in PHP.
         *
         * It previously selected the member's entire history for this exercise
         * and then discarded everything outside the window while looping (the
         * `$startedAt->lt($from)` / `->gt($to)` checks further down). The result
         * was correct but the cost grew forever: a member with two years of
         * training transferred every one of those rows to keep the twenty inside
         * a 90-day window.
         *
         * Pushing the bounds into the query means the database returns only the
         * rows that can be used. The filter is on `ws.started_at`, which is also
         * the ORDER BY column, so the index added for workout_sessions can serve
         * both and the ordering is unchanged.
         */
        $query = DB::table('workout_exercises as we')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->join('workout_sets as s', 's.workout_exercise_id', '=', 'we.id')
            ->where('ws.user_id', $user->id)
            ->where('we.exercise_id', $exercise->id)
            ->whereNotNull('ws.finished_at')
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps');

        if ($from !== null) {
            $query->where('ws.started_at', '>=', $from);
        }

        if ($to !== null) {
            $query->where('ws.started_at', '<=', $to);
        }

        $query = $query
            ->orderBy('ws.started_at')
            ->get([
                'ws.id as session_id',
                'ws.started_at',
                's.weight_kg',
                's.reps',
            ]);

        $best = [];
        foreach ($query as $row) {
            $e1rm = static::estimated1rm((float) $row->weight_kg, (int) $row->reps);
            if ($e1rm === null) {
                continue;
            }

            $startedAt = Carbon::parse($row->started_at);

            $key = (int) $row->session_id;
            if (!isset($best[$key]) || $e1rm > $best[$key]['e1rm']) {
                $best[$key] = [
                    'session_id' => $key,
                    'date' => $startedAt->toDateString(),
                    'e1rm' => $e1rm,
                    'weight' => (float) $row->weight_kg,
                    'reps' => (int) $row->reps,
                ];
            }
        }

        usort($best, fn ($a, $b) => strcmp($a['date'], $b['date']));

        return array_values($best);
    }

    /**
     * Average percentage change (first → last) of best-set e1RM across the
     * compound "big lifts", over the given window. Returns null when no
     * exercise has at least two data points.
     */
    public function bigLiftTrendPct(User $user, CarbonInterface $from, CarbonInterface $to, array $slugs): ?float
    {
        if ($slugs === []) {
            return null;
        }

        /*
         * One query for every slug, not one per slug.
         *
         * This loop previously ran `Exercise::where('slug', $slug)->first()`
         * inside it — four round trips for four big lifts, every time the
         * dashboard loaded. The lookup is a fixed set of known slugs, so it can
         * be fetched in a single `whereIn`.
         *
         * Keyed by slug afterwards so the loop below stays readable and the
         * order of `$slugs` is still what drives the iteration.
         */
        $exercises = Exercise::whereIn('slug', $slugs)->get()->keyBy('slug');

        $changes = [];

        foreach ($slugs as $slug) {
            $exercise = $exercises->get($slug);
            if (! $exercise) {
                continue;
            }

            $points = $this->bestSetPerSession($user, $exercise, $from, $to);
            if (count($points) < 2) {
                continue;
            }

            $first = $points[0]['e1rm'];
            $last = $points[count($points) - 1]['e1rm'];
            if ($first > 0) {
                $changes[] = ($last - $first) / $first * 100;
            }
        }

        if ($changes === []) {
            return null;
        }

        return round(array_sum($changes) / count($changes), 2);
    }
}
