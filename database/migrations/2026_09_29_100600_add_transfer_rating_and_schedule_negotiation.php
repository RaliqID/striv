<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Closes the gaps that make a one-way trainer relationship dangerous.
 *
 * Without these, a member whose trainer quits, or a trainer who is a poor fit,
 * is stuck with no exit: there is no way to release, no way to hand over, and
 * no record of why. Each column below exists to make one of those recoverable.
 *
 *   end_reason / ended_by_user_id  → why a coaching relationship ended, and
 *                                    who ended it (member, trainer, or admin)
 *   requested_schedule             → the member can propose slots, not just
 *                                    receive them; a schedule the client had
 *                                    no say in is one they will not follow
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trainer_assignments', function (Blueprint $table) {
            // Why the relationship ended. Kept as text rather than an enum so
            // a new reason does not need a migration to record.
            $table->string('end_reason', 40)->nullable()->after('assigned_by');

            // Who ended it. Null for system-driven endings (auto-rematch).
            $table->foreignId('ended_by_user_id')->nullable()->after('end_reason')
                ->constrained('users')->nullOnDelete();

            // Set when the member releases a trainer and we look for another,
            // so a failed re-match is visible rather than silent.
            $table->timestamp('rematch_requested_at')->nullable()->after('ended_at');

            $table->index(['user_id', 'status', 'ended_at']);
        });

        Schema::table('trainer_feedback', function (Blueprint $table) {
            /*
             * Member's rating of their trainer, 1-5.
             *
             * Stored on feedback rather than a separate table because the
             * natural moment to rate is right after receiving coaching input.
             * Only meaningful on general notes (workout_session_id IS NULL);
             * a live in-session nudge is not something anyone rates.
             */
            $table->unsignedTinyInteger('rating')->nullable()->after('kind');

            $table->index(['trainer_id', 'rating']);
        });

        Schema::table('trainer_schedules', function (Blueprint $table) {
            /*
             * Whether the member proposed this slot or the trainer did.
             *
             * `proposed_by`: 'trainer' | 'member'. The UI shows a member's
             * request as pending on the trainer's screen and vice versa, so the
             * two sides never both think they are waiting.
             */
            $table->string('proposed_by', 20)->default('trainer')->after('focus');

            // Member's response to a trainer-proposed slot.
            // null = awaiting, 'accepted', 'declined'.
            $table->string('member_response', 20)->nullable()->after('confirmed_at');
            $table->timestamp('member_responded_at')->nullable()->after('member_response');
        });
    }

    public function down(): void
    {
        Schema::table('trainer_schedules', function (Blueprint $table) {
            $table->dropColumn(['proposed_by', 'member_response', 'member_responded_at']);
        });

        Schema::table('trainer_feedback', function (Blueprint $table) {
            $table->dropIndex(['trainer_id', 'rating']);
            $table->dropColumn('rating');
        });

        Schema::table('trainer_assignments', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'status', 'ended_at']);
            $table->dropConstrainedForeignId('ended_by_user_id');
            $table->dropColumn(['end_reason', 'rematch_requested_at']);
        });
    }
};
