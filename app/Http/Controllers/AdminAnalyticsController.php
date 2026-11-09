<?php

namespace App\Http\Controllers;

use App\Services\Security\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Reporting backend for the admin analytics dashboard.
 *
 * Two rules drive the shape of everything here:
 *
 * 1. Buckets come from the calendar, not from the rows that happen to exist.
 *    A quiet day has to come back as an explicit zero, otherwise the chart
 *    closes the gap and a flat week reads as growth.
 * 2. Every KPI is returned next to the same metric for the preceding window,
 *    so the UI can show direction without a second round trip.
 *
 * Ranges are bucketed server-side: a year of daily bars is unreadable, so
 * 90d folds to weeks and 1y to months before it ever reaches the client.
 */
class AdminAnalyticsController extends Controller
{
    /**
     * Supported windows. `days` drives the lookback, `granularity` the bucket
     * width. `daily` is the current calendar day, bucketed by hour.
     */
    private const RANGES = [
        'daily' => ['days' => 1, 'granularity' => 'hour'],
        '7d' => ['days' => 7, 'granularity' => 'day'],
        '30d' => ['days' => 30, 'granularity' => 'day'],
        '90d' => ['days' => 90, 'granularity' => 'week'],
        '1y' => ['days' => 365, 'granularity' => 'month'],
    ];

    public function __construct(private readonly AuditLogger $audit)
    {
    }

    public function index(Request $request)
    {
        return response()->json($this->payload($this->resolveRange($request)));
    }

    /**
     * Sectioned CSV of the same payload the dashboard renders.
     *
     * One file rather than one endpoint per table: an operator exporting a
     * report wants the whole picture in a single spreadsheet, and it keeps the
     * numbers in the export provably identical to the ones on screen.
     */
    public function export(Request $request): StreamedResponse
    {
        $range = $this->resolveRange($request);
        $data = $this->payload($range);

        $this->audit->log('analytics.exported', $request->user(), null, [
            'range' => $range,
        ], $request);

        $filename = 'striv-analytics-'.$range.'-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($data, $range) {
            $out = fopen('php://output', 'w');

            fputcsv($out, ['Striv analytics report']);
            fputcsv($out, ['Range', $range]);
            fputcsv($out, ['Granularity', $data['granularity']]);
            fputcsv($out, ['Window start', $data['range_start']]);
            fputcsv($out, ['Window end', $data['range_end']]);
            fputcsv($out, ['Generated at', $data['generated_at']]);
            fputcsv($out, []);

            fputcsv($out, ['KPIs']);
            fputcsv($out, ['Metric', 'Value', 'Previous period', 'Change %']);
            foreach ($data['kpis'] as $key => $kpi) {
                fputcsv($out, [
                    $key,
                    $kpi['value'],
                    $kpi['previous'],
                    $kpi['delta_pct'] === null ? 'n/a' : $kpi['delta_pct'],
                ]);
            }
            fputcsv($out, []);

            fputcsv($out, ['All-time totals']);
            fputcsv($out, ['Metric', 'Value']);
            foreach ($data['totals'] as $key => $value) {
                fputcsv($out, [$key, $value]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Series ('.$data['granularity'].')']);
            $header = ['bucket'];
            foreach (array_keys($data['series']['metrics']) as $name) {
                $header[] = $name;
            }
            fputcsv($out, $header);

            foreach ($data['series']['labels'] as $i => $label) {
                $row = [$label];
                foreach ($data['series']['metrics'] as $values) {
                    $row[] = $values[$i] ?? 0;
                }
                fputcsv($out, $row);
            }
            fputcsv($out, []);

            fputcsv($out, ['Role distribution']);
            fputcsv($out, ['Role', 'Users']);
            foreach ($data['breakdowns']['roles'] as $row) {
                fputcsv($out, [$row['label'], $row['value']]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Top exercises']);
            fputcsv($out, ['Exercise', 'Uses']);
            foreach ($data['breakdowns']['top_exercises'] as $row) {
                fputcsv($out, [$row['name'], $row['uses']]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Most active members']);
            fputcsv($out, ['Member', 'Workouts', 'Volume (kg)']);
            foreach ($data['breakdowns']['top_users'] as $row) {
                fputcsv($out, [$row['name'], $row['workouts'], $row['volume_kg']]);
            }
            fputcsv($out, []);

            fputcsv($out, ['Recent signups']);
            fputcsv($out, ['Name', 'Email', 'Role', 'Joined at']);
            foreach ($data['breakdowns']['recent_signups'] as $row) {
                fputcsv($out, [$row['name'], $row['email'], $row['role'], $row['created_at']]);
            }

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Reject unknown ranges instead of silently serving a different window. */
    private function resolveRange(Request $request): string
    {
        $range = (string) $request->query('range', '30d');

        return array_key_exists($range, self::RANGES) ? $range : '30d';
    }

    private function payload(string $range): array
    {
        $granularity = self::RANGES[$range]['granularity'];
        $now = Carbon::now();

        $start = $range === 'daily'
            ? $now->copy()->startOfDay()
            : $now->copy()->subDays(self::RANGES[$range]['days'] - 1)->startOfDay();

        // Like-for-like: the comparison window covers the same elapsed span and
        // ends just before the current one opens, so a half-finished day is
        // never measured against a full one.
        $prevEnd = $start->copy()->subSecond();
        $prevStart = $prevEnd->copy()->subSeconds($start->diffInSeconds($now));

        $buckets = $this->buildBuckets($granularity, $start, $now);

        $raw = [
            'signups' => $this->countByBucket('users', $granularity, $start, $now),
            'workouts' => $this->countByBucket('workout_sessions', $granularity, $start, $now),
            'sets' => $this->countByBucket('workout_sets', $granularity, $start, $now),
            'chat_messages' => $this->countByBucket('chat_messages', $granularity, $start, $now),
            'certificates' => $this->countByBucket('certificates', $granularity, $start, $now),
            'volume_kg' => $this->volumeByBucket($granularity, $start, $now),
            'active_users' => $this->activeUsersByBucket($granularity, $start, $now),
        ];

        $metrics = [];
        foreach ($raw as $name => $map) {
            $metrics[$name] = array_map(
                fn (array $bucket) => round((float) ($map[$bucket['key']] ?? 0), 2),
                $buckets
            );
        }

        return [
            'range' => $range,
            'granularity' => $granularity,
            'generated_at' => $now->toIso8601String(),
            'range_start' => $start->toIso8601String(),
            'range_end' => $now->toIso8601String(),
            'kpis' => [
                'new_users' => $this->kpi(
                    $this->countIn('users', $start, $now),
                    $this->countIn('users', $prevStart, $prevEnd)
                ),
                'active_users' => $this->kpi(
                    $this->activeUsersIn($start, $now),
                    $this->activeUsersIn($prevStart, $prevEnd)
                ),
                'workouts' => $this->kpi(
                    $this->countIn('workout_sessions', $start, $now),
                    $this->countIn('workout_sessions', $prevStart, $prevEnd)
                ),
                'sets' => $this->kpi(
                    $this->countIn('workout_sets', $start, $now),
                    $this->countIn('workout_sets', $prevStart, $prevEnd)
                ),
                'volume_kg' => $this->kpi(
                    $this->volumeIn($start, $now),
                    $this->volumeIn($prevStart, $prevEnd)
                ),
                'chat_messages' => $this->kpi(
                    $this->countIn('chat_messages', $start, $now),
                    $this->countIn('chat_messages', $prevStart, $prevEnd)
                ),
                'certificates' => $this->kpi(
                    $this->countIn('certificates', $start, $now),
                    $this->countIn('certificates', $prevStart, $prevEnd)
                ),
                'achievements' => $this->kpi(
                    $this->countIn('user_achievements', $start, $now),
                    $this->countIn('user_achievements', $prevStart, $prevEnd)
                ),
            ],
            'totals' => [
                'total_users' => (int) DB::table('users')->count(),
                'total_workouts' => (int) DB::table('workout_sessions')->count(),
                'total_sets' => (int) DB::table('workout_sets')->count(),
                'total_volume_kg' => $this->volumeAllTime(),
                'suspended_users' => (int) DB::table('users')->where('is_suspended', true)->count(),
                'trainers' => (int) DB::table('users')->where('role', 'trainer')->count(),
                'admins' => (int) DB::table('users')->where('role', 'admin')->count(),
            ],
            'series' => [
                'labels' => array_map(fn (array $bucket) => $bucket['key'], $buckets),
                'metrics' => $metrics,
            ],
            'breakdowns' => [
                'roles' => $this->roleBreakdown(),
                'top_exercises' => $this->topExercises($start, $now),
                'top_users' => $this->topUsers($start, $now),
                'recent_signups' => $this->recentSignups($start, $now),
            ],
        ];
    }

    // ---------------------------------------------------------------------
    // windows + buckets
    // ---------------------------------------------------------------------

    /**
     * Ordered bucket list for the window.
     *
     * Weeks and months collapse onto the first day they contain, which is why
     * the dedupe check exists: iterating day by day is the only way to keep the
     * list aligned with the calendar when a month starts mid-week.
     *
     * @return list<array{key: string}>
     */
    private function buildBuckets(string $granularity, Carbon $start, Carbon $end): array
    {
        $buckets = [];
        $cursor = $start->copy();
        $step = $granularity === 'hour' ? 'addHour' : 'addDay';

        while ($cursor->lte($end)) {
            $key = $granularity === 'hour'
                ? $cursor->format('Y-m-d H:00:00')
                : $this->bucketKeyFor($cursor->toDateString(), $granularity);

            if ($buckets === [] || $buckets[count($buckets) - 1]['key'] !== $key) {
                $buckets[] = ['key' => $key];
            }

            $cursor->{$step}();
        }

        return $buckets;
    }

    private function bucketKeyFor(string $key, string $granularity): string
    {
        return match ($granularity) {
            'hour', 'day' => $key,
            'week' => Carbon::parse($key)->startOfWeek()->toDateString(),
            default => substr($key, 0, 7),
        };
    }

    /** Collapse raw per-hour/per-day keys onto their reporting bucket. */
    private function fold(array $rows, string $granularity): array
    {
        $out = [];

        foreach ($rows as $key => $value) {
            $bucket = $this->bucketKeyFor((string) $key, $granularity);
            $out[$bucket] = ($out[$bucket] ?? 0) + $value;
        }

        return $out;
    }

    // ---------------------------------------------------------------------
    // series
    // ---------------------------------------------------------------------

    private function countByBucket(string $table, string $granularity, Carbon $start, Carbon $end): array
    {
        $expr = $granularity === 'hour'
            ? $this->hourExpr('created_at')
            : $this->dayExpr('created_at');

        $rows = DB::table($table)
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->selectRaw("{$expr} as bucket, count(*) as total")
            ->groupBy('bucket')
            ->pluck('total', 'bucket');

        return $this->fold($rows->all(), $granularity);
    }

    private function volumeByBucket(string $granularity, Carbon $start, Carbon $end): array
    {
        $expr = $granularity === 'hour'
            ? $this->hourExpr('ws.created_at')
            : $this->dayExpr('ws.created_at');

        $rows = DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.created_at', '>=', $start)
            ->where('ws.created_at', '<=', $end)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->selectRaw("{$expr} as bucket, sum(s.weight_kg * s.reps) as total")
            ->groupBy('bucket')
            ->pluck('total', 'bucket');

        return $this->fold($rows->all(), $granularity);
    }

    /**
     * Distinct active users per bucket.
     *
     * Collects (bucket, user) pairs from both activity tables and unions them in
     * PHP. Counting each table separately and adding the totals would
     * double-count anyone who both trained and chatted on the same day, and
     * summing per-day distinct counts into a week would report user-days rather
     * than users. The pair set is bounded by distinct user-days, which is small
     * enough at this scale to keep the answer exact.
     */
    private function activeUsersByBucket(string $granularity, Carbon $start, Carbon $end): array
    {
        $expr = $granularity === 'hour'
            ? $this->hourExpr('created_at')
            : $this->dayExpr('created_at');

        $sets = [];

        foreach (['workout_sessions', 'chat_messages'] as $table) {
            DB::table($table)
                ->where('created_at', '>=', $start)
                ->where('created_at', '<=', $end)
                ->distinct()
                ->selectRaw("{$expr} as bucket, user_id")
                ->get()
                ->each(function ($row) use (&$sets, $granularity) {
                    $key = $this->bucketKeyFor((string) $row->bucket, $granularity);
                    $sets[$key][$row->user_id] = true;
                });
        }

        return array_map('count', $sets);
    }

    // ---------------------------------------------------------------------
    // scalars
    // ---------------------------------------------------------------------

    private function countIn(string $table, Carbon $start, Carbon $end): int
    {
        return (int) DB::table($table)
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->count();
    }

    private function volumeIn(Carbon $start, Carbon $end): float
    {
        return round((float) DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.created_at', '>=', $start)
            ->where('ws.created_at', '<=', $end)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->sum(DB::raw('s.weight_kg * s.reps')), 2);
    }

    private function volumeAllTime(): float
    {
        return round((float) DB::table('workout_sets as s')
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->sum(DB::raw('s.weight_kg * s.reps')), 2);
    }

    private function activeUsersIn(Carbon $start, Carbon $end): int
    {
        $ids = collect();

        foreach (['workout_sessions', 'chat_messages'] as $table) {
            $ids = $ids->merge(
                DB::table($table)
                    ->where('created_at', '>=', $start)
                    ->where('created_at', '<=', $end)
                    ->distinct()
                    ->pluck('user_id')
            );
        }

        return $ids->unique()->count();
    }

    /**
     * @return array{value: int|float, previous: int|float, delta_pct: float|null}
     */
    private function kpi(int|float $current, int|float $previous): array
    {
        // A jump from zero has no percentage. Reporting null lets the client
        // say "new" instead of rendering a fake +100%.
        $delta = $previous > 0
            ? round((($current - $previous) / $previous) * 100, 1)
            : null;

        return ['value' => $current, 'previous' => $previous, 'delta_pct' => $delta];
    }

    // ---------------------------------------------------------------------
    // breakdowns
    // ---------------------------------------------------------------------

    private function roleBreakdown(): array
    {
        $counts = DB::table('users')->selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role');

        return array_map(
            fn (string $role) => ['label' => $role, 'value' => (int) ($counts[$role] ?? 0)],
            ['user', 'trainer', 'admin']
        );
    }

    private function topExercises(Carbon $start, Carbon $end): array
    {
        return DB::table('workout_exercises as we')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.created_at', '>=', $start)
            ->where('ws.created_at', '<=', $end)
            ->selectRaw('e.name as name, count(we.id) as uses')
            ->groupBy('e.id', 'e.name')
            ->orderByDesc('uses')
            ->limit(8)
            ->get()
            ->map(fn ($row) => ['name' => (string) $row->name, 'uses' => (int) $row->uses])
            ->all();
    }

    private function topUsers(Carbon $start, Carbon $end): array
    {
        $top = DB::table('workout_sessions as ws')
            ->join('users as u', 'u.id', '=', 'ws.user_id')
            ->where('ws.created_at', '>=', $start)
            ->where('ws.created_at', '<=', $end)
            ->selectRaw('u.id as id, u.name as name, count(*) as workouts')
            ->groupBy('u.id', 'u.name')
            ->orderByDesc('workouts')
            ->limit(8)
            ->get();

        $ids = $top->pluck('id')->all();

        // One follow-up query for every listed member rather than one per row.
        $volumes = $ids === [] ? collect() : DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->whereIn('ws.user_id', $ids)
            ->where('ws.created_at', '>=', $start)
            ->where('ws.created_at', '<=', $end)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->selectRaw('ws.user_id as user_id, sum(s.weight_kg * s.reps) as volume')
            ->groupBy('ws.user_id')
            ->pluck('volume', 'user_id');

        return $top->map(fn ($row) => [
            'id' => (int) $row->id,
            'name' => (string) $row->name,
            'workouts' => (int) $row->workouts,
            'volume_kg' => round((float) ($volumes[$row->id] ?? 0), 2),
        ])->all();
    }

    private function recentSignups(Carbon $start, Carbon $end): array
    {
        return DB::table('users')
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->select('id', 'name', 'email', 'role', 'created_at')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'email' => (string) $row->email,
                'role' => (string) $row->role,
                'created_at' => Carbon::parse($row->created_at)->toIso8601String(),
            ])
            ->all();
    }

    // ---------------------------------------------------------------------
    // dialect helpers
    // ---------------------------------------------------------------------

    /**
     * Date bucketing differs between SQLite (local dev) and MySQL (deployed),
     * so the expression is chosen at runtime instead of hardcoding one.
     */
    private function dayExpr(string $column): string
    {
        return match ($this->driver()) {
            'pgsql' => "to_char({$column}, 'YYYY-MM-DD')",
            'sqlite' => "date({$column})",
            default => "DATE({$column})",
        };
    }

    private function hourExpr(string $column): string
    {
        return match ($this->driver()) {
            'pgsql' => "to_char({$column}, 'YYYY-MM-DD HH24:00:00')",
            'sqlite' => "strftime('%Y-%m-%d %H:00:00', {$column})",
            default => "DATE_FORMAT({$column}, '%Y-%m-%d %H:00:00')",
        };
    }

    private function driver(): string
    {
        return DB::connection()->getDriverName();
    }
}
