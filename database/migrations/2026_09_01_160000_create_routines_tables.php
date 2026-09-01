<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('notes')->nullable();
            $table->unsignedSmallInteger('est_duration_minutes')->nullable();
            $table->timestamps();
        });

        Schema::create('routine_exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('routine_id')->constrained()->cascadeOnDelete();
            $table->foreignId('exercise_id')->constrained();
            $table->unsignedSmallInteger('order');
            $table->unsignedSmallInteger('target_sets')->nullable();
            $table->unsignedSmallInteger('target_reps')->nullable();
            $table->decimal('target_weight_kg', 8, 2)->nullable();
            $table->timestamps();

            $table->unique(['routine_id', 'order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routine_exercises');
        Schema::dropIfExists('routines');
    }
};
