<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Generic OpenAI-compatible provider driven by config.
 * Works with Groq, Xkiro, OpenAI, Mistral, or any /chat/completions API.
 *
 * Config lives at config('services.{providerKey}') with keys: key, base_uri, model.
 */
class OpenAICompatibleProvider implements AIProviderInterface
{
    private const TIMEOUT_SECONDS = 30;
    private const MAX_ATTEMPTS = 3;
    private const RETRY_BACKOFF_MS = 200;

    public function __construct(private readonly string $providerKey)
    {
    }

    private function config(): array
    {
        return config("services.{$this->providerKey}") ?? [];
    }

    private function apiKey(): ?string
    {
        $key = $this->config()['key'] ?? null;
        return ($key && trim($key) !== '') ? $key : null;
    }

    private function baseUri(): string
    {
        return rtrim($this->config()['base_uri'] ?? 'https://api.groq.com/openai/v1', '/');
    }

    private function model(): string
    {
        return $this->config()['model'] ?? 'openai/gpt-oss-120b';
    }

    private function isTransient(int $status): bool
    {
        return $status === 408 || $status === 429 || $status >= 500;
    }

    /**
     * Structured insight generation (JSON mode).
     */
    public function generateInsight(array $context): ?array
    {
        $apiKey = $this->apiKey();
        if ($apiKey === null) {
            return null;
        }

        $systemPrompt = "You are Striv, a training intelligence system. You receive deterministic, pre-computed training patterns with evidence plus a user profile. Generate concise, motivating insights tailored to the athlete. Rules: 1) Never invent numbers not present in evidence. 2) Never make medical claims or prescribe training programs. 3) Keep summaries concise (max 2 sentences, max 280 chars). 4) Output valid JSON only with keys: title (max 80 chars), summary (max 280 chars), recommendation (max 280 chars — one concrete actionable suggestion based on evidence + profile). 5) Match tone to user experience level: beginner = encouraging, intermediate = analytical, advanced = peer-to-peer technical. 6) If primary_goal is strength, prioritize load progressions; if muscle, prioritize volume; if endurance, prioritize frequency/volume balance.";

        $payload = [
            'model' => $this->model(),
            'temperature' => 0.3,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
            ],
        ];

        $raw = $this->postChat($payload);
        if ($raw === null) {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            Log::warning("[{$this->providerKey}] insight content not JSON", ['content' => substr($raw, 0, 120)]);
            return null;
        }

        $title = $decoded['title'] ?? null;
        $summary = $decoded['summary'] ?? null;
        $recommendation = $decoded['recommendation'] ?? null;

        if (!is_string($title) || !is_string($summary) || !is_string($recommendation)) {
            Log::warning("[{$this->providerKey}] insight missing keys");
            return null;
        }

        return [
            'title' => mb_substr($title, 0, 80),
            'summary' => mb_substr($summary, 0, 280),
            'recommendation' => mb_substr($recommendation, 0, 280),
        ];
    }

    /**
     * Raw chat completion for the AI Coach (plain text reply).
     *
     * @param  array<int, array{role: string, content: string}>  $messages
     * @param  array{temperature?: float, max_tokens?: int}  $options
     */
    public function chat(array $messages, array $options = []): ?string
    {
        $apiKey = $this->apiKey();
        if ($apiKey === null) {
            return null;
        }

        $payload = [
            'model' => $this->model(),
            'messages' => $messages,
            'temperature' => $options['temperature'] ?? 0.4,
            'max_tokens' => $options['max_tokens'] ?? 600,
        ];

        return $this->postChat($payload);
    }

    /**
     * POST /chat/completions with retry + transient handling. Returns content string or null.
     */
    private function postChat(array $payload): ?string
    {
        $apiKey = $this->apiKey();
        if ($apiKey === null) {
            return null;
        }

        $url = $this->baseUri() . '/chat/completions';
        $lastError = null;

        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            try {
                $response = Http::withToken($apiKey)
                    ->timeout(self::TIMEOUT_SECONDS)
                    ->acceptJson()
                    ->asJson()
                    ->post($url, $payload);

                if ($response->successful()) {
                    $content = $response->json('choices.0.message.content');
                    return (is_string($content) && $content !== '') ? $content : null;
                }

                if ($attempt < self::MAX_ATTEMPTS && $this->isTransient($response->status())) {
                    usleep(self::RETRY_BACKOFF_MS * 1000);
                    continue;
                }

                Log::warning("[{$this->providerKey}] non-2xx", [
                    'status' => $response->status(),
                    'body' => substr($response->body(), 0, 200),
                ]);
                return null;
            } catch (Throwable $e) {
                $lastError = $e;
                if ($attempt < self::MAX_ATTEMPTS) {
                    usleep(self::RETRY_BACKOFF_MS * 1000);
                    continue;
                }
            }
        }

        Log::warning("[{$this->providerKey}] exhausted retries", ['error' => $lastError?->getMessage()]);
        return null;
    }
}
