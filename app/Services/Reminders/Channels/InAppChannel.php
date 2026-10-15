<?php

namespace App\Services\Reminders\Channels;

use App\Models\AppNotification;
use App\Models\User;

/**
 * Delivers reminders as in-app notifications.
 *
 * Always configured and always on whenever the member has the app open, so it
 * acts as the backstop: even if email is down or WhatsApp is unconfigured, the
 * member still sees the nudge the next time they open Striv. It is also the
 * only channel with no per-kind opt-out, because an in-app badge is not an
 * interruption the way an email or a message is.
 */
class InAppChannel implements ReminderChannel
{
    public function key(): string
    {
        return 'in_app';
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function isEnabledFor(User $user): bool
    {
        return true;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function send(User $user, array $payload): bool
    {
        AppNotification::create([
            'user_id' => $user->id,
            'type' => (string) ($payload['type'] ?? AppNotification::TYPE_CLIENT_WAITING),
            'title' => (string) ($payload['title'] ?? ''),
            'body' => (string) ($payload['text'] ?? ''),
            'action_url' => $payload['action_url'] ?? null,
        ]);

        return true;
    }
}
