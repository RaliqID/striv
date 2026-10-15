<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The weekly training schedule a trainer confirms for a client.
 *
 * One row per training day, not one row per assignment: a client training four
 * days a week has four rows, which keeps the shape flat and lets the client
 * screen render a straight list without unpacking a JSON blob.
 *
 * day_of_week uses ISO-8601 numbering (1 = Monday … 7 = Sunday) rather than
 * Carbon's 0 = Sunday, because it matches what people mean by "day 1" and
 * sorts naturally.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trainer_schedules', function (Blueprint $table) {
            $table->id();

            $table->foreignId('trainer_assignment_id')
                ->constrained('trainer_assignments')->cascadeOnDelete();

            // 1 = Monday … 7 = Sunday.
            $table->unsignedTinyInteger('day_of_week');

            // Free-form slot so the trainer can write "18:00-19:30" or "morning"
            // — a rigid TIME column cannot express a window or a preference.
            $table->string('time_slot', 60)->nullable();

            // e.g. "Upper body — push focus".
            $table->string('focus', 120)->nullable();
            $table->text('notes')->nullable();

            // Set when the trainer confirms this slot with the client. NULL
            // means proposed but not yet agreed.
            $table->timestamp('confirmed_at')->nullable();

            $table->timestamps();

            $table->index(['trainer_assignment_id', 'day_of_week']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trainer_schedules');
    }
};
