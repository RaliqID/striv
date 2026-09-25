<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Turn goals from "current value vs an absolute number" into "progress from
     * a baseline to a target".
     *
     * The old model compared the all-time personal record directly against the
     * target, so a goal whose target had already been achieved showed 100% the
     * instant it was created and never moved again. Recording the starting
     * value makes progress measurable as a delta, which is what "goal" means.
     */
    public function up(): void
    {
        Schema::table('goals', function (Blueprint $table) {
            // Baseline the improvement is measured from.
            $table->decimal('starting_value', 10, 2)->nullable()->after('target_value');

            // Set when the goal reaches 100%, so status stops being manual.
            $table->timestamp('completed_at')->nullable()->after('deadline');

            // Non-exercise goals (e.g. total workouts) have no exercise.
            $table->foreignId('exercise_id')->nullable()->change();
        });

        // Existing rows keep working: a null baseline is treated as 0, which
        // reproduces the previous behaviour rather than silently hiding data.
        DB::table('goals')->whereNull('starting_value')->update(['starting_value' => 0]);

        Schema::table('goals', function (Blueprint $table) {
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('goals', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'status']);
            $table->dropColumn(['starting_value', 'completed_at']);
        });

        Schema::table('goals', function (Blueprint $table) {
            $table->foreignId('exercise_id')->nullable(false)->change();
        });
    }
};
