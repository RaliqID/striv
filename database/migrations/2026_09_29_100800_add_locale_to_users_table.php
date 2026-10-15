<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user interface language.
 *
 * Stored on the user rather than only in the browser so the choice follows them
 * across devices, and so server-generated content (API messages, exports, mail)
 * can be rendered in the same language as the UI.
 *
 * Defaults to English. An existing account keeps English until it chooses
 * otherwise — guessing a language from IP or name would be wrong often enough
 * to be worse than a sane default.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Short locale code: 'en' or 'id'. Length 5 leaves room for a region
            // suffix later ('en-US') without another migration.
            $table->string('locale', 5)->default('en')->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('locale');
        });
    }
};
