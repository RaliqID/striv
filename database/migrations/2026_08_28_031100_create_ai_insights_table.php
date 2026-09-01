<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_insights', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('summary');
            $table->json('evidence')->nullable();
            $table->decimal('confidence', 5, 2)->nullable();
            $table->timestamp('time_range_start')->nullable();
            $table->timestamp('time_range_end')->nullable();
            $table->timestamp('generated_at')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_insights');
    }
};