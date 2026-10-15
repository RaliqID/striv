<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Progression: XP, level, and a log of how the XP was earned.
 *
 * Three tables rather than one, because they answer different questions and
 * change at different rates:
 *
 *   user_stats    — the current total and level. ONE row per member, read on
 *                   every page load, so it must be cheap.
 *   xp_events     — the append-only ledger of every award. This is what makes
 *                   the system trustworthy: a member who thinks they were
 *                   short-changed can be shown exactly where each point came
 *                   from, and a bug can be traced rather than guessed at.
 *   achievement_* — long-lived unlocks, separate because they are rare and
 *                   deserve their own history.
 *
 * The total is stored rather than summed from the ledger on read: a member with
 * a year of history would otherwise need an aggregate on every dashboard load,
 * and the ledger exists for auditing, not for rendering.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_stats', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

            /*
             * Lifetime total. Never decreases — the level curve is applied on
             * top of it, so a penalty (missing a session) reduces the DERIVED
             * figure without erasing what was earned. Rewriting a lifetime
             * total downward is how a progression system loses credibility.
             */
            $table->unsignedInteger('total_xp')->default(0);

            /*
             * Spendable balance. This is what penalties reduce, and what the
             * level is computed from. Kept separate from total_xp so "XP this
             * run" and "XP ever" are both answerable.
             */
            $table->integer('current_xp')->default(0);

            $table->unsignedSmallInteger('level')->default(1);

            // Cached leaderboard position, refreshed by the stats endpoint.
            // A true rank query over every member on each request would be the
            // most expensive thing on the page.
            $table->unsignedInteger('rank')->nullable();

            $table->timestamp('last_activity_at')->nullable();
            $table->timestamps();

            $table->index('current_xp');
            $table->index('level');
        });

        /*
         * The award ledger.
         *
         * `source` is a machine key (workout_completed, pr_set, schedule_kept,
         * streak_week, session_missed) so the UI can group and label awards
         * without parsing free text.
         *
         * `dedupe_key` is the anti-farming guard: a unique index on it means the
         * same award cannot be granted twice for the same thing (the same
         * session, the same exercise's PR, the same week's streak). Without it,
         * re-finishing a session or re-running a sweep would mint XP from
         * nothing — which is exactly the kind of bug that makes players stop
         * trusting the number.
         */
        Schema::create('xp_events', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('source', 40);

            // Negative for penalties.
            $table->integer('amount');

            // Human-readable context, e.g. the exercise name for a PR.
            $table->string('label', 160)->nullable();

            // Loose reference so an event can point at a session or record
            // without a morph, which keeps the ledger readable in the DB.
            $table->string('subject_type', 60)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();

            /*
             * Unique per (user, dedupe_key). Nullable so a genuinely repeatable
             * award can opt out — but every source in use sets it.
             */
            $table->string('dedupe_key', 120)->nullable();

            $table->timestamps();

            $table->unique(['user_id', 'dedupe_key']);
            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'source']);
        });

        Schema::create('achievements', function (Blueprint $table) {
            $table->id();

            // Stable key used in code, e.g. 'first_session', 'ten_workouts'.
            $table->string('key', 60)->unique();

            // Translation keys, not copy: the label must follow the member's
            // language, and the badge list is rendered on more than one screen.
            $table->string('name_key', 120);
            $table->string('description_key', 160);

            // Material Symbols glyph.
            $table->string('icon', 40);

            // Grouping for the achievements page: milestone, streak, strength,
            // consistency.
            $table->string('category', 30);

            // XP granted the moment the badge unlocks.
            $table->unsignedSmallInteger('xp_reward')->default(0);

            // Ordering hint so easier badges list first.
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();
        });

        Schema::create('user_achievements', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('achievement_id')->constrained()->cascadeOnDelete();

            $table->timestamp('unlocked_at');

            // Whether the member has seen the unlock, so a badge earned while
            // they were away can be celebrated on their next visit instead of
            // appearing silently in a list.
            $table->timestamp('seen_at')->nullable();

            $table->timestamps();

            $table->unique(['user_id', 'achievement_id']);
            $table->index(['user_id', 'unlocked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_achievements');
        Schema::dropIfExists('achievements');
        Schema::dropIfExists('xp_events');
        Schema::dropIfExists('user_stats');
    }
};
