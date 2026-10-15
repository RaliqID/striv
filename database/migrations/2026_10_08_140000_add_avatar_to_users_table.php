<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Profile avatars.
 *
 * Stored on the USER rather than on user_profiles, because the avatar is
 * identity, not training data: it belongs on the same row the sidebar, the
 * leaderboard and the trainer's client list already read. Putting it on the
 * profile would mean every one of those has to join to render a face.
 *
 * Only the storage path is kept, never a URL. Where the file is served from is
 * a routing decision — the file itself lives on the private disk and is streamed
 * through an authorised endpoint, so storing a URL here would bake in an address
 * that a later change could not move.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            /*
             * Relative path on the 'local' disk, e.g. avatars/61/abc123.jpg.
             * Nullable: most accounts will not have one, and the UI falls back
             * to initials rather than a generic silhouette.
             */
            $table->string('avatar_path')->nullable()->after('bio');

            /*
             * The detected content type, stored rather than re-read from the
             * file on every request.
             *
             * The serving endpoint needs a Content-Type, and probing the file
             * each time costs a read plus a mime lookup on a path that is already
             * known to be an image — the type was verified at upload. Recording
             * it follows the same shape as workout evidence photos, so both
             * upload paths store what they will later serve.
             */
            $table->string('avatar_mime', 40)->nullable()->after('avatar_path');

            /*
             * When the avatar was last changed.
             *
             * Kept so the serving endpoint can set a far-future cache header and
             * still be correct: the URL carries this value, so a new upload
             * produces a new URL and browsers fetch the new image immediately
             * instead of showing the old one from cache.
             */
            $table->timestamp('avatar_updated_at')->nullable()->after('avatar_mime');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['avatar_path', 'avatar_mime', 'avatar_updated_at']);
        });
    }
};
