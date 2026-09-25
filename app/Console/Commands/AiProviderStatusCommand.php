<?php

namespace App\Console\Commands;

use App\Services\AI\AIInsightService;
use Illuminate\Console\Command;

/**
 * Diagnose the configured AI provider chain.
 *
 * A provider that is selected but unconfigured fails silently (the generic
 * provider returns null and the app quietly falls back to deterministic
 * output), which looks like "the AI is ignoring me" rather than a misconfig.
 * This makes the effective chain visible.
 */
class AiProviderStatusCommand extends Command
{
    protected $signature = 'ai:status {--ping : Send a real request to the primary provider}';

    protected $description = 'Show the active AI provider chain and whether each link is configured';

    public function handle(AIInsightService $insights): int
    {
        $primary = config('services.ai.provider');
        $fallback = config('services.ai.fallback');
        $vision = config('services.ai.vision');

        $this->table(
            ['Role', 'Provider', 'Configured', 'Base URI', 'Model'],
            [
                $this->row('primary', $primary),
                $this->row('fallback', $fallback),
                $this->row('vision', $vision),
            ]
        );

        $resolved = count($insights->providers());
        $this->line("Resolved provider chain: {$resolved} link(s)");

        if ($resolved === 0) {
            $this->error('No provider is usable — AI features will fall back to deterministic output.');
            $this->line('Set an API key for the selected provider in .env (e.g. DEVSTACK_API_KEY).');

            return self::FAILURE;
        }

        if ($this->option('ping')) {
            $provider = $insights->provider();
            $reply = $provider?->chat([
                ['role' => 'user', 'content' => 'Reply with the single word: ok'],
            ], ['max_tokens' => 16]);

            if ($reply === null) {
                $this->error('Ping failed: the primary provider returned no content.');

                return self::FAILURE;
            }

            $this->info('Ping OK: '.trim($reply));
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, string>
     */
    private function row(string $role, mixed $key): array
    {
        if (! is_string($key) || $key === '') {
            return [$role, '—', 'no', '—', '—'];
        }

        $cfg = config("services.{$key}");
        $configured = is_array($cfg) && ! empty($cfg['key']);

        return [
            $role,
            $key,
            $configured ? 'yes' : 'NO',
            (string) ($cfg['base_uri'] ?? '—'),
            (string) ($cfg['model'] ?? '—'),
        ];
    }
}
