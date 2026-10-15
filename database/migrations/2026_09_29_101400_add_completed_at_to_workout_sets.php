<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks a set as actually performed.
 *
 * Set only when a photo of that set has been verified, which is what makes the
 * column trustworthy: the previous flow let the client tick a set with no
 * evidence at all, so a session record meant "the member says so" rather than
 * "the member did it".
 *
 * Nullable, and null for every existing row — those sets were completed before
 * evidence was required, and retroactively declaring them unproven would erase
 * real history.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            if (! Schema::hasColumn('workout_sets', 'completed_at')) {
                $table->timestamp('completed_at')->nullable()->after('rpe');
            }
        });
    }

    public function down(): void
    {
        Schema::table('workout_sets', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }
};
