<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remembers the value a personal record replaced.
 *
 * PRs are stored one row per (user, exercise, type) and UPDATED in place when
 * beaten, so the previous best is destroyed at the moment it is most useful —
 * right after the member beats it. Without this column, the reward screen can
 * only say "20kg"; with it, it can say "20kg, up from 10kg", which is the part
 * that actually feels like an achievement.
 *
 * Nullable: a first-ever record has nothing to compare against, and NULL is the
 * honest representation of that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_records', function (Blueprint $table) {
            if (! Schema::hasColumn('personal_records', 'previous_value')) {
                $table->decimal('previous_value', 8, 2)->nullable()->after('value');
            }
        });
    }

    public function down(): void
    {
        Schema::table('personal_records', function (Blueprint $table) {
            $table->dropColumn('previous_value');
        });
    }
};
