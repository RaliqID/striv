<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Photo evidence for a workout set.
 *
 * A set cannot be marked complete without one. That is the whole point: a
 * checklist anyone can tick without training is a checklist that measures
 * nothing, and it lets a member (and their trainer) believe a session happened
 * when it did not. Requiring a photo makes the record an observation rather
 * than a claim.
 *
 * The photo attaches to the WORKOUT SET, not the session, because that is the
 * unit being claimed and the unit the rest timer gates. One photo per set.
 *
 * `ai_analysis` holds what the vision model reported about the image, stored
 * alongside rather than only shown once, so a trainer reopening the session a
 * week later still sees what the system said.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workout_set_photos', function (Blueprint $table) {
            $table->id();

            // One photo per set: a unique index turns "did they attach one?"
            // into a database guarantee rather than a convention.
            $table->foreignId('workout_set_id')->unique()->constrained('workout_sets')->cascadeOnDelete();

            // Denormalised owner. The trainer's photo feed filters by member,
            // and joining set -> exercise -> session -> user for every row of
            // that feed is needless work on the hottest read path.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Relative path on the configured disk. Not a full URL, so the
            // storage host can change without rewriting rows.
            $table->string('path');

            $table->string('mime', 60);
            $table->unsignedInteger('size_bytes');

            // What the vision model saw: a short factual description, plus a
            // confidence and whether it looked like an actual training scene.
            // Null when vision was unavailable — the photo still counts as
            // evidence even if the analysis failed.
            $table->text('ai_analysis')->nullable();
            $table->string('ai_verdict', 20)->nullable();   // plausible | unclear | rejected
            $table->decimal('ai_confidence', 4, 3)->nullable();

            // Trainer's own note about this photo, when they review it.
            $table->text('trainer_note')->nullable();
            $table->timestamp('reviewed_at')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workout_set_photos');
    }
};
