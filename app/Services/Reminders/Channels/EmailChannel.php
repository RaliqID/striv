<?php

namespace App\Services\Reminders\Channels;

use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Delivers reminders by email.
 *
 * Uses a plain Mailable rather than a notification so the same rendered payload
 * can be reused by other channels — the reminder service builds one title/body
 * pair and each channel decides how to package it.
 */
class EmailChannel implements ReminderChannel
{
    public function key(): string
    {
        return 'email';
    }

    /**
     * Email is configured when an SMTP host and sender are present.
     *
     * Checked rather than assumed: a fresh install with no MAIL_* set would
     * otherwise fail on every send and fill the log with failures that look
     * like bugs.
     */
    public function isConfigured(): bool
    {
        return config('mail.default') !== null
            && config('mail.from.address') !== null;
    }

    public function isEnabledFor(User $user): bool
    {
        return (bool) $user->reminder_email_enabled;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function send(User $user, array $payload): bool
    {
        if (! $this->isConfigured()) {
            Log::warning('EmailChannel: mail not configured, skipping', [
                'user_id' => $user->id,
            ]);

            return false;
        }

        Mail::to($user->email)->send(new \App\Mail\ReminderMail($user, $payload));

        return true;
    }
}
