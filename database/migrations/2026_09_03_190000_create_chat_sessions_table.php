<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title')->default('New chat');
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'last_message_at']);
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            $table->foreignId('chat_session_id')
                ->nullable()
                ->after('user_id')
                ->constrained('chat_sessions')
                ->cascadeOnDelete();
            $table->text('image_path')->nullable()->after('content');

            $table->index(['chat_session_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('chat_session_id');
            $table->dropColumn('image_path');
        });

        Schema::dropIfExists('chat_sessions');
    }
};
