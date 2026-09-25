<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_audit_logs', function (Blueprint $table) {
            $table->id();

            // Who acted. Nullable + nullOnDelete so removing an admin account
            // never erases the history of what they did.
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name');

            // What they acted on. Kept as a plain string (not a foreign key)
            // so a deleted user's history survives with their identity intact.
            $table->unsignedBigInteger('target_user_id')->nullable();
            $table->string('target_label')->nullable();

            $table->string('action', 64);
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            $table->index(['action', 'created_at']);
            $table->index(['target_user_id', 'created_at']);
            $table->index(['actor_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_audit_logs');
    }
};
