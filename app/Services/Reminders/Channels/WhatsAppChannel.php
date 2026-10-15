<?php

namespace App\Services\Reminders\Channels;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Delivers reminders over WhatsApp.
 *
 * WhatsApp is the channel members here actually read, so this is where most
 * reminders will eventually go. It is written and wired now but stays dormant
 * until a provider is configured — `isConfigured()` returns false with no key,
 * so the dispatcher skips it and the app works fully on email in the meantime.
 *
 * Two Indonesian providers are supported because both are common and cheap for
 * Indonesian numbers, and their APIs differ only in the request shape. Adding a
 * third means one more branch, not a rewrite.
 *
 * Configuration (.env):
 *   WHATSAPP_PROVIDER=fonnte|wablas
 *   WHATSAPP_TOKEN=<provider token>
 *   WHATSAPP_API_URL=<provider base url>   (optional; sensible default per provider)
 *
 * The member's number is expected in `phone` as an E.164 string ("+62812…").
 * Numbers are normalised to the local 08… form the providers expect, because
 * sending them an unnormalised +62 is the most common cause of silent failure.
 */
class WhatsAppChannel implements ReminderChannel
{
    public function key(): string
    {
        return 'whatsapp';
    }

    public function isConfigured(): bool
    {
        return filled(config('services.whatsapp.token'))
            && filled(config('services.whatsapp.provider'));
    }

    public function isEnabledFor(User $user): bool
    {
        // Requires BOTH the member's opt-in and a phone number on file: an
        // opt-in with nowhere to send is not a deliverable channel.
        return (bool) $user->reminder_whatsapp_enabled
            && filled($user->phone ?? null);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function send(User $user, array $payload): bool
    {
        if (! $this->isConfigured()) {
            return false;
        }

        $target = $this->normalisePhone($user->phone ?? null);

        if ($target === null) {
            Log::warning('WhatsAppChannel: unusable phone number', [
                'user_id' => $user->id,
            ]);

            return false;
        }

        $body = $this->compose($payload);

        try {
            $response = match (config('services.whatsapp.provider')) {
                'fonnte' => $this->sendFonnte($target, $body),
                'wablas' => $this->sendWablas($target, $body),
                default => null,
            };

            if ($response === null || ! $response->successful()) {
                Log::warning('WhatsAppChannel: provider rejected message', [
                    'user_id' => $user->id,
                    'status' => $response?->status(),
                    'body' => $response?->body(),
                ]);

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            // Network failure must not abort the whole reminder run; the caller
            // records the failure and moves on to the next member.
            Log::error('WhatsAppChannel: send threw', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /** Plain-text message: WhatsApp does not render HTML. */
    private function compose(array $payload): string
    {
        $title = (string) ($payload['title'] ?? '');
        $text = (string) ($payload['text'] ?? '');

        return trim($title."\n\n".$text);
    }

    private function sendFonnte(string $target, string $message)
    {
        return Http::withHeaders([
            'Authorization' => (string) config('services.whatsapp.token'),
        ])->asForm()->post(
            $this->endpoint('https://api.fonnte.com/send'),
            ['target' => $target, 'message' => $message],
        );
    }

    private function sendWablas(string $target, string $message)
    {
        return Http::withHeaders([
            'Authorization' => (string) config('services.whatsapp.token'),
        ])->asForm()->post(
            $this->endpoint('https://console.wablas.com/api/send-message'),
            ['phone' => $target, 'message' => $message],
        );
    }

    /**
     * Resolve the API endpoint, falling back to the provider default.
     *
     * Uses `?:` rather than config()'s default argument on purpose: that
     * argument only applies when the key is ABSENT. Here the key always exists
     * (it is declared in config/services.php) and is null when unset, so the
     * default was never used and the request went out with a null URL.
     */
    private function endpoint(string $fallback): string
    {
        $configured = config('services.whatsapp.api_url');

        return is_string($configured) && trim($configured) !== ''
            ? trim($configured)
            : $fallback;
    }

    /**
     * Normalise a stored number to the local form providers expect.
     *
     * Accepts "+628123…", "628123…", "08123…" and returns "08123…".
     * Returns null for anything that cannot be a valid number, so the caller
     * records a failure instead of the provider silently dropping it.
     */
    private function normalisePhone(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        // Keep digits only.
        $digits = preg_replace('/\D+/', '', $raw) ?? '';

        if ($digits === '') {
            return null;
        }

        // 62… and +62… are the country-code forms; providers want a leading 0.
        if (str_starts_with($digits, '62')) {
            $digits = '0'.substr($digits, 2);
        }

        // Require a leading 0 and a plausible length for an Indonesian mobile.
        if (! str_starts_with($digits, '0') || strlen($digits) < 10 || strlen($digits) > 14) {
            return null;
        }

        return $digits;
    }
}
