<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('personal_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exercise_id')->constrained();
            $table->foreignId('workout_session_id')->constrained();
            $table->string('pr_type'); // weight, reps, volume, one_rm
            $table->decimal('value', 10, 2);
            $table->timestamp('achieved_at');
            $table->timestamps();

            $table->unique(['user_id', 'exercise_id', 'pr_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_records');
    }
};