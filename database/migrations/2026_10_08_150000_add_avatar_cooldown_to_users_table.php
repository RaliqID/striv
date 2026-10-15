<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rate limit on changing a profile photo.
 *
 * ---------------------------------------------------------------------------
 * WHY A SEPARATE COLUMN, NOT avatar_updated_at
 * ---------------------------------------------------------------------------
 * The obvious shortcut is to reuse avatar_updated_at, which already records when
 * the photo last changed. That would be wrong, and would ship a bypass:
 *
 *   remove() clears avatar_path AND would clear avatar_updated_at, because the
 *   member no longer has a photo. A cooldown read from that column would then
 *   see "never changed" and allow an immediate upload. Remove → upload → remove
 *   → upload would cycle freely, which is exactly the abuse the limit exists to
 *   prevent.
 *
 * The two values also mean different things, which is the deeper reason to keep
 * them apart:
 *
 *   avatar_updated_at      when the CURRENT FILE was stored. Drives the
 *                          cache-busting version in the avatar URL, so it must
 *                          follow the file — including being cleared with it.
 *
 *   avatar_change_allowed_at
 *                          when the member may next change their photo. Tied to
 *                          the ACTION, not the file, so it survives a removal
 *                          and cannot be reset by cycling.
 *
 * Stored as a forward-looking timestamp rather than "last changed at" so the
 * check is a single comparison and the client can render "you can change this
 * again on <date>" without doing date arithmetic of its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            /*
             * Nullable, and null means "no restriction".
             *
             * That is the correct initial state for every existing account and
             * for a member who has never set a photo: their first upload must
             * not be blocked by a cooldown they never triggered.
             */
            $table->timestamp('avatar_change_allowed_at')->nullable()->after('avatar_updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('avatar_change_allowed_at');
        });
    }
};
