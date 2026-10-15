<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One reminder email.
 *
 * Content is passed in already rendered and translated by the reminder service,
 * which resolves the member's locale before building the payload. Keeping the
 * Mailable dumb means the same payload drives email, WhatsApp and in-app
 * without three copies of the copy.
 */
class ReminderMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Plain arrays, not an Eloquent model: serialising a model into a queued
     * mailable would re-fetch it at send time and lose the values computed when
     * the reminder was built (e.g. "3 days since your last session").
     *
     * @param  array<string, mixed>  $payload
     */
    public function __construct(
        public readonly User $member,
        public readonly array $payload,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: (string) ($this->payload['subject'] ?? $this->payload['title'] ?? 'Striv'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.reminder',
            with: [
                'member' => $this->member,
                'title' => (string) ($this->payload['title'] ?? ''),
                'lines' => (array) ($this->payload['lines'] ?? []),
                'actionLabel' => (string) ($this->payload['action_label'] ?? ''),
                'actionUrl' => (string) ($this->payload['action_url'] ?? config('app.url')),
                'locale' => $this->member->locale ?? 'en',
            ],
        );
    }
}
