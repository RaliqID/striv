<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A trainer's note to a client.
 *
 * Three scopes, distinguished by which nullable columns are set:
 *
 *   - workout_session_id set → live coaching note on a specific session
 *     ("drop the load 10% on set 3"). This is what powers the live monitoring
 *     feed while the client is training.
 *   - workout_session_id NULL → a general message on the relationship
 *     ("great consistency this week").
 *
 * Both trainer_id and user_id are stored rather than derived through the
 * assignment, so a note keeps its author and recipient even after the
 * assignment ends or is deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trainer_feedback', function (Blueprint $table) {
            $table->id();

            $table->foreignId('trainer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // Optional link to the session being commented on. Nulled rather
            // than cascaded if the session is removed, so the note survives as
            // general feedback instead of silently vanishing.
            $table->foreignId('workout_session_id')->nullable()
                ->constrained('workout_sessions')->nullOnDelete();

            $table->text('message');

            // Distinguishes a live in-session nudge from a general remark, so
            // the client UI can style them differently without inferring it.
            $table->string('kind', 20)->default('note');

            // The client may acknowledge a live note; the trainer sees whether
            // guidance actually landed.
            $table->timestamp('read_at')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['workout_session_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trainer_feedback');
    }
};
