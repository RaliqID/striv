<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class GroqProvider implements AIProviderInterface
{
    private const SYSTEM_PROMPT = "You are Striv, a training intelligence system. You receive deterministic, pre-computed training patterns with evidence plus a user profile. Generate concise, motivating insights tailored to the athlete. Rules: 1) Never invent numbers not present in evidence. 2) Never make medical claims or prescribe training programs. 3) Keep summaries concise (max 2 sentences, max 280 chars). 4) Output valid JSON only with keys: title (max 80 chars), summary (max 280 chars), recommendation (max 280 chars — one concrete actionable suggestion based on evidence + profile). 5) Match tone to user experience level: beginner = encouraging, intermediate = analytical, advanced = peer-to-peer technical. 6) If primary_goal is strength, prioritize load progressions; if muscle, prioritize volume; if endurance, prioritize frequency/volume balance.";

    private const TIMEOUT_SECONDS = 30;

    private const MAX_ATTEMPTS = 3; // initial + 2 retries

    private const RETRY_BACKOFF_MS = 200;

    public function generateInsight(array $context): ?array
    {
        $config = config('services.groq');
        $apiKey = $config['key'] ?? null;
        $baseUri = rtrim($config['base_uri'] ?? 'https://api.groq.com/openai/v1', '/');
        $model = $config['model'] ?? 'openai/gpt-oss-120b';

        if (empty($apiKey)) {
            return null;
        }

        $url = $baseUri . '/chat/completions';

        $payload = [
            'model' => $model,
            'temperature' => 0.3,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => self::SYSTEM_PROMPT],
                ['role' => 'user', 'content' => json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
            ],
        ];

        $response = null;
        $lastException = null;

        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            try {
                $response = Http::withToken($apiKey)
                    ->timeout(self::TIMEOUT_SECONDS)
                    ->acceptJson()
                    ->asJson()
                    ->post($url, $payload);

                if ($response->successful()) {
                    return $this->parseAndValidate($response->json());
                }

                // Non-2xx: log and retry on transient codes, else give up.
                if ($attempt < self::MAX_ATTEMPTS && $this->isTransient($response->status())) {
                    usleep(self::RETRY_BACKOFF_MS * 1000);
                    continue;
                }

                Log::warning('GroqProvider non-2xx response', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return null;
            } catch (Throwable $e) {
                $lastException = $e;
                if ($attempt < self::MAX_ATTEMPTS) {
                    usleep(self::RETRY_BACKOFF_MS * 1000);
                    continue;
                }
            }
        }

        Log::warning('GroqProvider exhausted retries', [
            'error' => $lastException?->getMessage(),
        ]);

        return null;
    }

    private function isTransient(int $status): bool
    {
        return $status === 408 || $status === 429 || $status >= 500;
    }

    /**
     * Raw chat completion for the AI Coach (non-JSON mode, plain text reply).
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array{temperature?: float, max_tokens?: int}  $options
     * @return string|null  Assistant reply text, or null on failure.
     */
    public function chat(array $messages, array $options = []): ?string
    {
        $config = config('services.groq');
        $apiKey = $config['key'] ?? null;
        if (empty($apiKey)) {
            return null;
        }

        $baseUri = rtrim($config['base_uri'] ?? 'https://api.groq.com/openai/v1', '/');
        $model = $config['model'] ?? 'openai/gpt-oss-120b';
        $url = $baseUri . '/chat/completions';

        $payload = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => $options['temperature'] ?? 0.4,
            'max_tokens' => $options['max_tokens'] ?? 600,
        ];

        try {
            $response = Http::withToken($apiKey)
                ->timeout(self::TIMEOUT_SECONDS)
                ->acceptJson()
                ->asJson()
                ->post($url, $payload);

            if (!$response->successful()) {
                Log::warning('GroqProvider chat non-2xx', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return null;
            }

            $content = $response->json('choices.0.message.content');
            return is_string($content) && $content !== '' ? $content : null;
        } catch (Throwable $e) {
            Log::warning('GroqProvider chat failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    private function parseAndValidate(mixed $json): ?array
    {
        if (!is_array($json)) {
            Log::warning('GroqProvider invalid JSON envelope');
            return null;
        }

        $content = $json['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || $content === '') {
            Log::warning('GroqProvider missing content');
            return null;
        }

        $decoded = json_decode($content, true);
        if (!is_array($decoded)) {
            Log::warning('GroqProvider content not JSON object', ['content' => $content]);
            return null;
        }

        $title = $decoded['title'] ?? null;
        $summary = $decoded['summary'] ?? null;
        $recommendation = $decoded['recommendation'] ?? null;

        if (!is_string($title) || !is_string($summary) || !is_string($recommendation)) {
            Log::warning('GroqProvider missing required keys');
            return null;
        }

        if (mb_strlen($title) > 80 || mb_strlen($summary) > 280 || mb_strlen($recommendation) > 280) {
            Log::warning('GroqProvider field length exceeded', [
                'title_len' => mb_strlen($title),
                'summary_len' => mb_strlen($summary),
                'recommendation_len' => mb_strlen($recommendation),
            ]);
            return null;
        }

        return [
            'title' => $title,
            'summary' => $summary,
            'recommendation' => $recommendation,
        ];
    }
}
