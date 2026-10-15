<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes for two tables that were being scanned in full.
 *
 * Found by running EXPLAIN QUERY PLAN against the queries the application
 * actually issues — not by guessing which columns "look" indexable. Both of
 * these showed `SCAN` where an index lookup was expected:
 *
 *   ai_insights    SCAN  for "this user's insights of this type"
 *   user_profiles  SCAN  for "this user's profile"
 *
 * `user_profiles` is the more serious of the two: the profile row is read on
 * every authenticated page render (the sidebar shows the member's details), and
 * the table grows one row per member, so the scan cost rises with the user
 * count rather than staying flat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            /*
             * One profile per user, and it is looked up by user_id every time.
             * The unique constraint also documents the one-to-one relationship
             * at the database level — the model already assumes it, so without
             * this a bug that created a second profile would silently make the
             * member's data ambiguous.
             */
            $table->unique('user_id', 'user_profiles_user_unique');
        });

        Schema::table('ai_insights', function (Blueprint $table) {
            /*
             * Deduplication checks "has this user already had an insight of this
             * type recently", which filters on both columns together. Composite
             * rather than two single-column indexes so one lookup serves the
             * whole predicate.
             */
            $table->index(['user_id', 'type'], 'ai_insights_user_type_idx');

            /*
             * The insight feed lists a member's newest insights first. Without
             * this the sort happens in a temporary b-tree after fetching every
             * row for the user.
             */
            $table->index(['user_id', 'created_at'], 'ai_insights_user_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('ai_insights', function (Blueprint $table) {
            $table->dropIndex('ai_insights_user_type_idx');
            $table->dropIndex('ai_insights_user_created_idx');
        });

        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropUnique('user_profiles_user_unique');
        });
    }
};
