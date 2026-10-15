<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stores the inputs a generated programme was built from.
 *
 * The coaching notes used to be written into `notes` as finished English prose
 * at generation time. That froze them in one language: switching the interface
 * to Indonesian left the notes in English, because they were already saved as
 * text. Keeping the inputs instead lets the notes be rendered on read, in
 * whatever language the member is using, and lets the wording be improved later
 * without regenerating every plan.
 *
 * `notes` is retained for notes a TRAINER writes by hand (auto_generated =
 * false), which are authored prose and should stay exactly as typed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            if (! Schema::hasColumn('routines', 'program_goal')) {
                $table->string('program_goal', 30)->nullable()->after('auto_generated');
                $table->string('program_experience', 30)->nullable()->after('program_goal');
                $table->unsignedSmallInteger('program_frequency')->nullable()->after('program_experience');
            }
        });
    }

    public function down(): void
    {
        Schema::table('routines', function (Blueprint $table) {
            $table->dropColumn(['program_goal', 'program_experience', 'program_frequency']);
        });
    }
};
