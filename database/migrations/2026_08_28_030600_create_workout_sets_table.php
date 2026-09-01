<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workout_sets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workout_exercise_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('set_number');
            $table->decimal('weight_kg', 8, 2)->nullable();
            $table->unsignedSmallInteger('reps')->nullable();
            $table->unsignedSmallInteger('rpe')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workout_sets');
    }
};