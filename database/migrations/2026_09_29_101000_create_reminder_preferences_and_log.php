<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reminder preferences and send log.
 *
 * Two things live here and both are about not annoying the member:
 *
 * 1. `reminder_preferences` — which reminders this member wants, and on which
 *    channel. A reminder system with no off switch gets its mail marked as
 *    spam, at which point it stops working for everyone on that domain. Opt-in
 *    per kind, defaulting to on, is the pattern that survives contact with
 *    real users.
 *
 * 2. `reminder_sends` — one row per reminder actually delivered. This is what
 *    makes "don't send twice" and "don't nag" enforceable: without it, a
 *    scheduled command that runs hourly would email the same member about the
 *    same workout all morning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Channel switches. Email on by default (it works today); WhatsApp
            // off until a provider is configured, so we never claim to send a
            // message we cannot actually deliver.
            $table->boolean('reminder_email_enabled')->default(true)->after('locale');
            $table->boolean('reminder_whatsapp_enabled')->default(false)->after('reminder_email_enabled');

            // Per-kind switches. Default true: the member asked for a trainer,
            // so a nudge about their training is expected until they say no.
            $table->boolean('remind_morning_of_training')->default(true)->after('reminder_whatsapp_enabled');
            $table->boolean('remind_streak_break')->default(true)->after('remind_morning_of_training');
            $table->boolean('remind_post_workout')->default(true)->after('remind_streak_break');
            $table->boolean('remind_weekly_recap')->default(true)->after('remind_post_workout');
            $table->boolean('remind_missed_session')->default(true)->after('remind_weekly_recap');
        });

        Schema::create('reminder_sends', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Which reminder: morning_training, streak_break, post_workout,
            // weekly_recap, missed_session.
            $table->string('kind', 40);

            // Which channel delivered it: email, whatsapp, in_app.
            $table->string('channel', 20);

            /*
             * The day this reminder is "about".
             *
             * Stored so uniqueness can be enforced per (member, kind, day)
             * rather than per row: that is exactly the guarantee needed to stop
             * a re-run sending the same morning reminder twice, while still
             * allowing tomorrow's.
             */
            $table->date('for_date');

            $table->timestamp('sent_at')->nullable();
            $table->string('status', 20)->default('sent');
            $table->text('error')->nullable();

            $table->timestamps();

            // The dedupe guarantee, enforced by the database rather than by
            // application logic that a future caller might forget.
            $table->unique(['user_id', 'kind', 'channel', 'for_date'], 'reminder_once_per_day');
            $table->index(['user_id', 'sent_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reminder_sends');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'reminder_email_enabled',
                'reminder_whatsapp_enabled',
                'remind_morning_of_training',
                'remind_streak_break',
                'remind_post_workout',
                'remind_weekly_recap',
                'remind_missed_session',
            ]);
        });
    }
};
