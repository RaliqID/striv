<?php

namespace App\Services\Reports;

use App\Models\AiReport;
use App\Models\PersonalRecord;
use App\Models\User;
use App\Models\WorkoutSession;
use App\Services\AI\AIProviderInterface;
use App\Services\Analytics\AnalyticsService;
use App\Services\Patterns\PatternDetectionService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Weekly training review generator.
 *
 * Deterministic core (counts, volume, PRs, top exercise) computed from
 * real data. Optional AI summary interpreted via provider; deterministic
 * fallback keeps the report complete when the provider is unavailable.
 * One report per user per ISO week (idempotent via week_start).
 */
class WeeklyReviewService
{
    public function __construct(
        protected readonly AnalyticsService $analytics,
        protected readonly PatternDetectionService $patterns,
    ) {
    }

    /**
     * Generate (or return existing) weekly report for a user.
     *
     * @param  User  $user
     * @param  Carbon|null  $weekStart  Monday of the target week (defaults to last week).
     * @return AiReport
     */
    public function generate(User $user, ?Carbon $weekStart = null): AiReport
    {
        $weekStart = ($weekStart ?? Carbon::now()->subWeek())->startOfWeek(); // Monday

        // Idempotency: existing report for this user + week + type
        // Casts 'date' stores 'Y-m-d H:i:s' in sqlite; compare against the
        // same normalized format the model will produce.
        $weekKey = $weekStart->format('Y-m-d');
        $existing = AiReport::where('user_id', $user->id)
            ->where('type', 'weekly')
            ->where(function ($q) use ($weekKey) {
                $q->whereDate('week_start', $weekKey)
                  ->orWhere('week_start', 'like', $weekKey . '%');
            })
            ->first();

        if ($existing) {
            return $existing;
        }

        $from = $weekStart->copy()->startOfDay();
        $to = $weekStart->copy()->addDays(7)->startOfDay(); // exclusive

        // === Deterministic core ===
        $sessions = WorkoutSession::where('user_id', $user->id)
            ->whereNotNull('finished_at')
            ->where('started_at', '>=', $from)
            ->where('started_at', '<', $to)
            ->with('workoutExercises.sets')
            ->orderBy('started_at')
            ->get();

        $setCount = 0;
        $totalVolume = 0.0;
        $exerciseVolume = []; // exercise_id => [name, volume]

        foreach ($sessions as $session) {
            foreach ($session->workoutExercises as $we) {
                $exVolume = 0.0;
                foreach ($we->sets as $set) {
                    if ($set->weight_kg !== null && $set->reps !== null) {
                        $setCount++;
                        $exVolume += $set->weight_kg * $set->reps;
                    }
                }
                $totalVolume += $exVolume;
                if ($we->exercise_id && $exVolume > 0) {
                    $name = $we->exercise->name ?? "Exercise #{$we->exercise_id}";
                    $exerciseVolume[$we->exercise_id] = [
                        'name' => $name,
                        'volume' => ($exerciseVolume[$we->exercise_id]['volume'] ?? 0) + $exVolume,
                    ];
                }
            }
        }

        // Top exercise by volume (strongest emphasis this week)
        $topExercise = null;
        if ($exerciseVolume) {
            $best = collect($exerciseVolume)->sortByDesc('volume')->first();
            $topExercise = ['name' => $best['name'], 'volume' => round($best['volume'], 1)];
        }

        // PRs achieved within window
        $prs = PersonalRecord::where('user_id', $user->id)
            ->whereBetween('achieved_at', [$from, $to])
            ->with('exercise')
            ->get()
            ->map(fn ($pr) => [
                'exercise' => $pr->exercise?->name,
                'type' => $pr->pr_type,
                'value' => (float) $pr->value,
            ])
            ->values()
            ->toArray();

        $deterministicSummary = $this->buildDeterministicSummary(
            $sessions->count(), $setCount, $totalVolume, count($prs), $topExercise
        );

        $content = [
            'week_start' => $weekStart->toDateString(),
            'week_end' => $to->copy()->subDay()->toDateString(),
            'workouts' => $sessions->count(),
            'sets' => $setCount,
            'volume_kg' => round($totalVolume, 1),
            'prs' => $prs,
            'pr_count' => count($prs),
            'top_exercise' => $topExercise,
            'summary' => $deterministicSummary,
            'summary_source' => 'deterministic',
        ];

        // === Optional AI interpretation ===
        $provider = app(\App\Services\AI\AIInsightService::class)->provider();
        if ($provider instanceof AIProviderInterface) {
            try {
                $context = [
                    'role' => 'summarize_training_week',
                    'user_profile' => [
                        'experience_level' => $user->profile?->experience_level,
                        'primary_goal' => $user->profile?->primary_goal,
                    ],
                    'week' => [
                        'workouts' => $content['workouts'],
                        'sets' => $content['sets'],
                        'volume_kg' => $content['volume_kg'],
                        'pr_count' => $content['pr_count'],
                        'top_exercise' => $topExercise['name'] ?? null,
                    ],
                    'instruction' => 'Write 2-3 sentences summarizing this training week. Only use the numbers given. Be concrete, never invent stats. Max 300 chars. Output JSON: {"summary": "..."}.',
                ];
                $ai = $provider->generateInsight($context);
                if ($ai && !empty($ai['summary'])) {
                    $content['summary'] = mb_substr($ai['summary'], 0, 300);
                    $content['summary_source'] = 'ai_interpreted';
                }
            } catch (\Throwable $e) {
                Log::warning('WeeklyReview AI summary failed, using deterministic', [
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return AiReport::create([
            'user_id' => $user->id,
            'type' => 'weekly',
            'week_start' => $weekStart->toDateString(),
            'content' => $content,
            'generated_at' => now(),
        ]);
    }

    private function buildDeterministicSummary(
        int $workouts,
        int $sets,
        float $volume,
        int $prCount,
        ?array $topExercise
    ): string {
        if ($workouts === 0) {
            return 'No workouts were logged this week. Start with one session to get back on track.';
        }

        $parts = ["You logged {$workouts} workout(s) and {$sets} sets, totalling "
            . round($volume) . ' kg of volume this week.'];

        if ($prCount > 0) {
            $parts[] = "You set {$prCount} new personal record(s) — strong week.";
        }

        if ($topExercise) {
            $parts[] = "Your main emphasis was {$topExercise['name']} ("
                . round($topExercise['volume']) . ' kg).';
        }

        return implode(' ', $parts);
    }
}
