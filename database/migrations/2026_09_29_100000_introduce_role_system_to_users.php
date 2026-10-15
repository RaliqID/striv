<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Introduces a first-class role system, replacing the `is_admin` boolean.
 *
 * The three roles are `user`, `trainer`, and `admin`. `is_admin` could only
 * express two states and had no way to represent a trainer, who needs the
 * same panel access as an admin but a narrower set of permissions.
 *
 * Order matters: the column is added, existing admins are backfilled into it,
 * and only then is `is_admin` dropped. Dropping first would lose the data.
 * The down() is the exact mirror, so the migration round-trips.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 20)->default('user')->after('password');
            $table->index('role');
        });

        // Every existing administrator keeps administrator rights.
        DB::table('users')->where('is_admin', true)->update(['role' => 'admin']);

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['is_admin']);
            $table->dropColumn('is_admin');
        });

        // Trainer-specific profile fields. Nullable because they only apply to
        // trainers; a NULL specialization simply means "not yet specified".
        Schema::table('users', function (Blueprint $table) {
            $table->string('specialization', 120)->nullable()->after('role');
            $table->text('bio')->nullable()->after('specialization');
            $table->boolean('is_available')->default(true)->after('bio');
            $table->unsignedSmallInteger('capacity')->default(25)->after('is_available');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['specialization', 'bio', 'is_available', 'capacity']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('is_suspended');
            $table->index('is_admin');
        });

        DB::table('users')->where('role', 'admin')->update(['is_admin' => true]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropColumn('role');
        });
    }
};
