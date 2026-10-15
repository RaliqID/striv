<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records that a photo could not be checked.
 *
 * When every vision endpoint is down, the photo cannot be verified — but the
 * member must not be blocked from training by an infrastructure outage. So the
 * photo is stored and a distinct flag records that no check happened.
 *
 * This is deliberately separate from `ai_verdict`: "we could not look" is a
 * different fact from "we looked and it seemed fine", and collapsing them is
 * what allowed an unverifiable photo of a bicep curl to count as a squat during
 * a Gemini outage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workout_set_photos', function (Blueprint $table) {
            if (! Schema::hasColumn('workout_set_photos', 'unverified')) {
                $table->boolean('unverified')->default(false)->after('ai_verdict');
            }
        });
    }

    public function down(): void
    {
        Schema::table('workout_set_photos', function (Blueprint $table) {
            $table->dropColumn('unverified');
        });
    }
};
