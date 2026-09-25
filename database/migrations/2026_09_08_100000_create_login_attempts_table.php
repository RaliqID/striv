<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('login_attempts', function (Blueprint $table) {
            $table->id();
            $table->string('email')->nullable();
            $table->string('ip_address', 45);
            $table->boolean('successful')->default(false);
            $table->string('user_agent', 512)->nullable();
            $table->timestamps();

            // Security panel queries: "recent failures", "failures for an IP",
            // "failures for an email" — all ordered by time.
            $table->index(['successful', 'created_at']);
            $table->index(['ip_address', 'created_at']);
            $table->index(['email', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_attempts');
    }
};
