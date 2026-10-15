<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A member's request for a personal trainer.
 *
 * Created automatically at signup (goal_type carried over from onboarding) so
 * the member never sees an empty state. The request then moves through a
 * status lifecycle, and the trainer assignment hangs off it.
 *
 * One row per training relationship, not one per member: a member who finishes
 * a programme and later requests again gets a new request row, which keeps the
 * history of what they asked for and who coached them each time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('training_requests', function (Blueprint $table) {
            $table->id();

            // The member asking for a trainer.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // pending  — auto-created at signup, awaiting trainer assignment
            // matched  — a trainer has been assigned (see trainer_assignments)
            // active   — trainer confirmed the schedule and started coaching
            // completed— programme finished
            // rejected — no trainer available / request withdrawn
            $table->string('status', 20)->default('pending');

            // The member's stated objective, copied from the onboarding
            // primary_goal. Never a raw kg/reps target: beginners do not know
            // what numbers to aim for, which is exactly why a trainer exists.
            $table->string('goal_type', 30)->nullable();

            // Free text: what the member wants, injuries, constraints, notes.
            $table->text('notes')->nullable();

            // Reason recorded when a request is rejected, shown to the member.
            $table->text('rejection_reason')->nullable();

            $table->timestamp('matched_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->timestamps();

            // The member's dashboard reads "my current request"; the trainer
            // queue reads "everything pending". Both are indexed here.
            $table->index(['user_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_requests');
    }
};
