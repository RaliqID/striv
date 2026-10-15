<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for the workout tables.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NEEDED
 * ---------------------------------------------------------------------------
 * `workout_sets`, `workout_exercises` and `workout_sessions` are the three
 * largest tables in the schema and had NO indexes beyond their primary keys.
 * Measured with EXPLAIN QUERY PLAN, every read of them was a full table scan:
 *
 *   session -> exercise -> set join        SCAN ws
 *   sessions by user, ordered by date      SCAN workout_sessions + TEMP B-TREE
 *   sets belonging to one exercise         SCAN workout_sets
 *
 * The scans are cheap today because the tables hold hundreds of rows, but the
 * cost is linear in table size — and these tables grow with every set a member
 * logs, forever. A member with a year of history would make every history page,
 * progress chart and record lookup progressively slower.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH INDEX IS FOR
 * ---------------------------------------------------------------------------
 * The columns were chosen from the queries the application actually runs, not
 * added speculatively. Each one below is justified by a real read path.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workout_sessions', function (Blueprint $table) {
            /*
             * Almost every session query is scoped to one member and ordered by
             * time: the history list, the progress chart, the streak calculation,
             * the missed-session sweep.
             *
             * Composite with finished_at second because the app almost always
             * filters on it as well ("finished", not merely started), and SQLite
             * can serve both the filter and the ORDER BY from one index instead
             * of sorting in a temp b-tree.
             */
            $table->index(['user_id', 'finished_at'], 'workout_sessions_user_finished_idx');

            // The trainer's client view filters by this.
            $table->index('started_at', 'workout_sessions_started_idx');
        });

        Schema::table('workout_exercises', function (Blueprint $table) {
            /*
             * Every read of exercises goes through its parent session — the
             * detail page, the finish handler, photo verification. Without this
             * the join scans the whole table for each session.
             */
            $table->index('workout_session_id', 'workout_exercises_session_idx');

            // Used when building a member's exercise history ("all sets of
            // Bench Press"), which is what the personal-record detection reads.
            $table->index('exercise_id', 'workout_exercises_exercise_idx');
        });

        Schema::table('workout_sets', function (Blueprint $table) {
            /*
             * The single hottest lookup in the schema: fetching the sets that
             * belong to one exercise. It runs for every exercise on every
             * session detail view, for PR detection on every finished session,
             * and for the volume calculation on the dashboard.
             *
             * This table grows fastest of all — one row per set, so roughly ten
             * per session — which makes it the one where a missing index hurts
             * first.
             */
            $table->index('workout_exercise_id', 'workout_sets_exercise_idx');

            /*
             * Photo evidence is counted per member (the documented-sets badge
             * and the proven-set XP award), and only completed sets count.
             */
            $table->index('completed_at', 'workout_sets_completed_idx');
        });
    }

    public function down(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->dropIndex('workout_sets_exercise_idx');
            $table->dropIndex('workout_sets_completed_idx');
        });

        Schema::table('workout_exercises', function (Blueprint $table) {
            $table->dropIndex('workout_exercises_session_idx');
            $table->dropIndex('workout_exercises_exercise_idx');
        });

        Schema::table('workout_sessions', function (Blueprint $table) {
            $table->dropIndex('workout_sessions_user_finished_idx');
            $table->dropIndex('workout_sessions_started_idx');
        });
    }
};
