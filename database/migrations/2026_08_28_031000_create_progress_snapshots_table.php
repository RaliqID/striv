<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('progress_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('volume_total', 12, 2)->nullable();
            $table->decimal('volume_weekly', 12, 2)->nullable();
            $table->unsignedSmallInteger('frequency_weekly')->nullable();
            $table->decimal('consistency_score', 5, 2)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('progress_snapshots');
    }
};