<?php

namespace App\Services\Reminders\Channels;

use App\Models\User;

/**
 * How a reminder reaches a member.
 *
 * An interface rather than calling Mail directly so the delivery mechanism can
 * be swapped or added without the reminder logic knowing. That matters here
 * specifically because WhatsApp is planned but not yet configured: the reminder
 * service can be written, tested and shipped against email today, and adding
 * WhatsApp later means writing one class and registering it, not revisiting
 * every trigger.
 */
interface ReminderChannel
{
    /** Stable identifier stored in the send log: 'email', 'whatsapp', … */
    public function key(): string;

    /**
     * Whether this channel can actually deliver right now.
     *
     * Used to skip a channel that has no provider configured, so the log
     * reflects what was really attempted rather than what was wished for.
     */
    public function isConfigured(): bool;

    /**
     * Whether this member wants to receive on this channel.
     *
     * Read from the member's own preferences rather than the channel, because
     * the member owns the decision.
     */
    public function isEnabledFor(User $user): bool;

    /**
     * Deliver one reminder.
     *
     * @param  array<string, mixed>  $payload  Rendered content + context
     * @return bool true when the provider accepted the message
     */
    public function send(User $user, array $payload): bool;
}
