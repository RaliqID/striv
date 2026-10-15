<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks a routine as machine-generated rather than trainer-authored.
 *
 * This distinction carries real weight: an auto-generated plan is a starting
 * point the trainer is expected to review, so regenerating it is safe. A plan
 * the trainer wrote by hand must never be silently replaced by a re-run of the
 * generator, which is what this flag lets us avoid.
 *
 * Default false, so every routine that already exists is treated as authored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            $table->boolean('auto_generated')->default(false)->after('trainer_assignment_id');
        });
    }

    public function down(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            $table->dropColumn('auto_generated');
        });
    }
};
