<?php

namespace App\Services\AI;

use App\Models\AiInsight;
use App\Models\User;
use App\Services\Patterns\PatternDetectionService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class AIInsightService
{
    /** Max insights generated per call (cost control). */
    private const MAX_PER_RUN = 3;

    /** Dedup window in days. */
    private const DEDUP_DAYS = 7;

    public function __construct(
        protected readonly PatternDetectionService $patterns,
        protected readonly InsightContextBuilder $contextBuilder,
    ) {
    }

    /**
     * Run pattern detection, dedup, and persist up to MAX_PER_RUN insights.
     *
     * @return array<int, AiInsight>
     */
    public function generateAndPersist(User $user): array
    {
        $patterns = $this->patterns->detect($user);

        $candidates = [];
        foreach ($patterns as $pattern) {
            if ($this->isDuplicate($user, $pattern)) {
                continue;
            }
            $candidates[] = $pattern;
            if (count($candidates) >= self::MAX_PER_RUN) {
                break;
            }
        }

        $created = [];
        $providers = $this->providers();

        foreach ($candidates as $pattern) {
            $insight = $this->buildInsight($user, $pattern, $providers);
            if ($insight) {
                $created[] = $insight;
            }
        }

        return $created;
    }

    /**
     * Provider chain: primary from config('services.ai.provider'), then fallback.
     * Returns null when neither is configured (deterministic-only mode).
     *
     * @return array<int, AIProviderInterface>
     */
    public function providers(): array
    {
        $chain = [];
        $primary = config('services.ai.provider', 'xkiro');
        $fallback = config('services.ai.fallback', 'groq');

        foreach (array_unique([$primary, $fallback]) as $key) {
            $provider = $this->makeProvider($key);
            if ($provider !== null) {
                $chain[] = $provider;
            }
        }

        return $chain;
    }

    /**
     * Legacy single-provider accessor (primary only). Kept for compatibility.
     */
    public function provider(): ?AIProviderInterface
    {
        return $this->providers()[0] ?? null;
    }

    /**
     * Vision-capable provider (config('services.ai.vision')) for chat
     * messages carrying images. Null when not configured.
     */
    public function visionProvider(): ?AIProviderInterface
    {
        $visionKey = config('services.ai.vision');
        if (!is_string($visionKey) || $visionKey === '') {
            return null;
        }
        return $this->makeProvider($visionKey);
    }

    private function makeProvider(string $key): ?AIProviderInterface
    {
        $cfg = config("services.{$key}");
        if (!is_array($cfg) || empty($cfg['key'])) {
            return null;
        }
        return new OpenAICompatibleProvider($key);
    }

    private function isDuplicate(User $user, array $pattern): bool
    {
        $type = $pattern['type'] ?? null;
        if (!is_string($type) || $type === '') {
            return false;
        }

        $cutoff = Carbon::now()->subDays(self::DEDUP_DAYS);

        $query = AiInsight::where('user_id', $user->id)
            ->where('type', $type)
            ->where('generated_at', '>=', $cutoff);

        $slug = $pattern['exercise_slug'] ?? null;
        if ($slug !== null && $slug !== '') {
            $query->where('evidence', 'like', '%"exercise":"' . addslashes($slug) . '"%');
        } else {
            $query->where(function ($q) {
                $q->whereNull('evidence')->orWhere('evidence', 'not like', '%"exercise":%');
            });
        }

        return $query->exists();
    }

    private function buildInsight(User $user, array $pattern, array $providers): ?AiInsight
    {
        // The insight is stored copy, so the deterministic fallback (used when
        // no AI provider is configured) must be built in the member's language.
        // Resolve it from the user rather than relying on the ambient request
        // locale: generation can run off the request cycle.
        $original = app()->getLocale();
        app()->setLocale($this->localeFor($user));

        try {
            return $this->persistInsight($user, $pattern, $providers);
        } finally {
            app()->setLocale($original);
        }
    }

    /** The locale to persist this member's insight copy in. */
    private function localeFor(User $user): string
    {
        $locale = $user->locale ?? null;

        return in_array($locale, ['en', 'id'], true) ? $locale : 'en';
    }

    private function persistInsight(User $user, array $pattern, array $providers): ?AiInsight
    {
        $context = $this->contextBuilder->build($user, $pattern);

        $aiResult = null;
        foreach ($providers as $provider) {
            try {
                $aiResult = $provider->generateInsight($context);
            } catch (\Throwable $e) {
                Log::warning('AIInsightService provider threw', ['error' => $e->getMessage()]);
                $aiResult = null;
            }
            if ($aiResult !== null) {
                break; // primary succeeded; skip fallback
            }
        }

        $recommendation = $aiResult['recommendation'] ?? null;
        $title = $aiResult['title'] ?? ($pattern['title'] ?? null);
        $summary = $aiResult['summary'] ?? ($pattern['summary'] ?? null);
        $source = $aiResult !== null ? 'ai_interpreted' : 'deterministic';

        if ($recommendation === null || $recommendation === '') {
            $recommendation = $this->deterministicRecommendation($pattern);
        }

        if (!$title || !$summary) {
            return null;
        }

        $window = is_array($pattern['window'] ?? null) ? $pattern['window'] : [];
        $windowStart = $window['start'] ?? null;
        $windowEnd = $window['end'] ?? null;

        $evidence = [
            'pattern' => $pattern,
            'recommendation' => $recommendation,
            'recommendation_from_ai' => $aiResult !== null,
            '_source' => $source,
        ];

        return AiInsight::create([
            'user_id' => $user->id,
            'type' => $pattern['type'] ?? 'unknown',
            'title' => $title,
            'summary' => $summary,
            'evidence' => $evidence,
            'confidence' => isset($pattern['confidence']) ? (float) $pattern['confidence'] : 0.5,
            'time_range_start' => $windowStart,
            'time_range_end' => $windowEnd,
            'generated_at' => now(),
        ]);
    }

    private function deterministicRecommendation(array $pattern): string
    {
        $type = $pattern['type'] ?? '';
        $evidence = is_array($pattern['evidence'] ?? null) ? $pattern['evidence'] : [];

        return match ($type) {
            'progress' => __('messages.insight.rec.progress'),
            'plateau' => __('messages.insight.rec.plateau'),
            'regression' => __('messages.insight.rec.regression'),
            'volume_change' => $this->volumeChangeDirection($evidence),
            'consistency' => $this->consistencyDirection($evidence),
            'milestone' => __('messages.insight.rec.milestone'),
            default => __('messages.insight.rec.default'),
        };
    }

    private function volumeChangeDirection(array $evidence): string
    {
        $pct = isset($evidence['pct']) ? (float) $evidence['pct'] : 0.0;
        if ($pct > 0) {
            return __('messages.insight.rec.volume_up');
        }
        if ($pct < 0) {
            return __('messages.insight.rec.volume_down');
        }
        return __('messages.insight.rec.volume_flat');
    }

    private function consistencyDirection(array $evidence): string
    {
        $delta = isset($evidence['delta_pp']) ? (float) $evidence['delta_pp'] : 0.0;
        if ($delta > 0) {
            return __('messages.insight.rec.consistency_up');
        }
        if ($delta < 0) {
            return __('messages.insight.rec.consistency_down');
        }
        return __('messages.insight.rec.consistency_flat');
    }
}
