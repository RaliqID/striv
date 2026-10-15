<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notifications.
 *
 * The automatic matching flow does things on the member's and trainer's behalf
 * with nobody watching: a request is created at signup, a trainer is assigned
 * seconds later, a schedule is proposed. Silent automation is indistinguishable
 * from a broken system, so every one of those steps writes a row here and the
 * recipient sees it in the UI with an unread count.
 *
 * Deliberately not Laravel's built-in notifications table: that one is keyed by
 * UUID string and shaped for mail/database channels, whereas this is a plain,
 * small, queryable inbox that the frontend reads and marks read in bulk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_notifications', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Machine-readable kind so the UI can pick an icon and route.
            // e.g. trainer_assigned, schedule_proposed, feedback_received,
            //      request_pending, client_waiting.
            $table->string('type', 40);

            $table->string('title', 160);
            $table->text('body')->nullable();

            // Where tapping the notification should go, and what it refers to.
            // Kept as loose strings rather than morphs so a notification can
            // outlive the row it points at without breaking the inbox query.
            $table->string('action_url', 255)->nullable();
            $table->string('subject_type', 60)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();

            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            // The unread badge is the hottest query in the panel.
            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_notifications');
    }
};
