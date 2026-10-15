<?php

namespace App\Http\Controllers;

use App\Models\ReminderSend;
use Illuminate\Http\Request;

/**
 * Reminder preferences.
 *
 * The off switch is not optional. A reminder system the member cannot turn off
 * gets its mail marked as spam, and once that happens the domain is burned for
 * everyone on it — so being able to say "stop" is what keeps the feature alive
 * for the members who do want it.
 */
class ReminderPreferenceController extends Controller
{
    /**
     * Current settings, plus which channels can actually deliver.
     *
     * `whatsapp_available` is reported so the UI can explain why the WhatsApp
     * toggle is not there yet, rather than showing a control that silently does
     * nothing.
     */
    public function show(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'channels' => [
                'email' => [
                    'enabled' => (bool) $user->reminder_email_enabled,
                    'available' => config('mail.default') !== null,
                ],
                'whatsapp' => [
                    'enabled' => (bool) $user->reminder_whatsapp_enabled,
                    'available' => filled(config('services.whatsapp.token')),
                    'phone' => $user->phone,
                ],
            ],
            'kinds' => [
                'morning_training' => (bool) $user->remind_morning_of_training,
                'streak_break' => (bool) $user->remind_streak_break,
                'post_workout' => (bool) $user->remind_post_workout,
                'weekly_recap' => (bool) $user->remind_weekly_recap,
                'missed_session' => (bool) $user->remind_missed_session,
            ],
        ]);
    }

    /**
     * Save settings.
     *
     * Every field is optional, so the client can send only what changed. Phone
     * is accepted here because it is the address a WhatsApp reminder needs, and
     * collecting it anywhere else would split one concern across two screens.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'email_enabled' => ['sometimes', 'boolean'],
            'whatsapp_enabled' => ['sometimes', 'boolean'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'morning_training' => ['sometimes', 'boolean'],
            'streak_break' => ['sometimes', 'boolean'],
            'post_workout' => ['sometimes', 'boolean'],
            'weekly_recap' => ['sometimes', 'boolean'],
            'missed_session' => ['sometimes', 'boolean'],
        ]);

        $user = $request->user();

        $map = [
            'email_enabled' => 'reminder_email_enabled',
            'whatsapp_enabled' => 'reminder_whatsapp_enabled',
            'morning_training' => 'remind_morning_of_training',
            'streak_break' => 'remind_streak_break',
            'post_workout' => 'remind_post_workout',
            'weekly_recap' => 'remind_weekly_recap',
            'missed_session' => 'remind_missed_session',
            'phone' => 'phone',
        ];

        $attributes = [];
        foreach ($map as $input => $column) {
            if (array_key_exists($input, $validated)) {
                $attributes[$column] = $validated[$input];
            }
        }

        // Refuse to enable WhatsApp with no number to send to — the setting
        // would look on while nothing could ever be delivered.
        $enablingWhatsApp = ($attributes['reminder_whatsapp_enabled'] ?? false) === true;
        $phone = $attributes['phone'] ?? $user->phone;

        if ($enablingWhatsApp && blank($phone)) {
            return response()->json([
                'message' => __('messages.reminder.phone_required'),
            ], 422);
        }

        if ($attributes !== []) {
            $user->forceFill($attributes)->save();
        }

        return response()->json([
            'message' => __('messages.updated'),
            'preferences' => $this->show($request)->getData(true),
        ]);
    }

    /**
     * A member's reminder history, newest first.
     *
     * Exposed so the member can see exactly what was sent and when — the direct
     * answer to "why am I getting these emails?", which is also the fastest way
     * to build trust that the off switch works.
     */
    public function history(Request $request)
    {
        $sends = ReminderSend::where('user_id', $request->user()->id)
            ->latest('sent_at')
            ->limit(50)
            ->get()
            ->map(fn (ReminderSend $s) => [
                'id' => $s->id,
                'kind' => $s->kind,
                'channel' => $s->channel,
                'status' => $s->status,
                'sent_at' => $s->sent_at?->toIso8601String(),
            ]);

        return response()->json(['reminders' => $sends]);
    }
}
