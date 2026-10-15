<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the member's phone number.
 *
 * Required before WhatsApp reminders can work at all: a member can opt in to
 * WhatsApp, but with no number on file there is nowhere to send. Stored as a
 * free string because members type it in many shapes ("+62…", "0812…") and the
 * channel normalises it at send time rather than forcing one format at input.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 32)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('phone');
        });
    }
};
