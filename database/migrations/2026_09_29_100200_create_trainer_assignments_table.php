<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The link between a trainer and the member they coach.
 *
 * Separate from training_requests because the relationship outlives the
 * request: a request records "asked for a coach", an assignment records "this
 * trainer is responsible for this member from date X". The member's live
 * monitoring feed and the trainer's client list are both driven from here.
 *
 * trainer_id and user_id are distinct foreign keys to the same table — one is
 * the coach, the other is the member. Both are indexed so neither side's list
 * query scans.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trainer_assignments', function (Blueprint $table) {
            $table->id();

            // The trainer (a user whose role is 'trainer').
            $table->foreignId('trainer_id')->constrained('users')->cascadeOnDelete();

            // The member being coached.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // The request this assignment answers.
            $table->foreignId('training_request_id')->nullable()
                ->constrained('training_requests')->nullOnDelete();

            // active — currently coaching
            // ended  — relationship closed (completed, transferred, cancelled)
            $table->string('status', 20)->default('active');

            // Set once the trainer confirms the schedule. Until then the member
            // sees "trainer assigned, awaiting schedule confirmation".
            $table->timestamp('confirmed_at')->nullable();

            // How the match was made: 'auto' (system balance) or 'manual'.
            $table->string('assigned_by', 20)->default('auto');

            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();

            $table->timestamps();

            // A member has at most one active trainer at a time. This partial
            // guarantee is enforced in the service layer, but the index keeps
            // the lookup fast and documents the intent.
            $table->index(['user_id', 'status']);
            $table->index(['trainer_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trainer_assignments');
    }
};
