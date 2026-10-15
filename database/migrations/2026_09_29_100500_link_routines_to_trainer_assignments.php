<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a routine to the trainer assignment that prescribed it.
 *
 * Nullable on purpose: routines existed before trainers did, and a member may
 * still build their own. NULL means "member-made", a value means "prescribed
 * by this trainer for this client" — which is how the client's programme
 * screen knows to label a routine as coming from their coach.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            $table->foreignId('trainer_assignment_id')->nullable()
                ->after('user_id')
                ->constrained('trainer_assignments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('trainer_assignment_id');
        });
    }
};
