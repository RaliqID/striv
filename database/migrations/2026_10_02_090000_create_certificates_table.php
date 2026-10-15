<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Certificates.
 *
 * A certificate is issued when a member completes a MILESTONE in full — the
 * whole streak ladder, the whole session ladder, and so on — rather than for
 * reaching an abstract level number. That distinction is the point: a level is
 * a running total that can be nudged, while a finished ladder is a body of work
 * that cannot be partially claimed.
 *
 * One row per (member, milestone), so a milestone is never issued twice. The
 * serial is stored rather than derived, because a certificate is a document
 * that may be printed or verified later and must keep the same number forever
 * even if the data around it changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('certificates', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /*
             * The milestone this certifies, e.g. 'sessions', 'streak',
             * 'strength', 'consistency'. Stored as a machine key so the label
             * can be translated at render time rather than frozen into the row.
             */
            $table->string('milestone', 40);

            /*
             * Human-readable serial, e.g. STRIV-STREAK-0007. Unique so a
             * certificate can be looked up by the number printed on it, and
             * stable so a reprint matches the original.
             */
            $table->string('serial', 40)->unique();

            /*
             * A snapshot of the member's name and the achievement at issue
             * time. Denormalised on purpose: a certificate is a record of a
             * moment, and it must not silently change if the member later
             * renames themselves or the milestone wording is reworded.
             */
            $table->string('member_name', 120);
            $table->string('title', 160);
            $table->string('subtitle', 200)->nullable();

            /*
             * The evidence that earned it, captured once — sessions completed,
            * weeks held, total volume. Shown on the certificate so it reads as a
             * record rather than a participation award.
             */
            $table->json('stats')->nullable();

            /*
             * The trainer credited on the certificate, if the member had one at
             * issue time. Nullable because self-guided members earn these too,
             * and requiring a trainer would block them.
             */
            $table->string('trainer_name', 120)->nullable();
            $table->foreignId('trainer_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('issued_at');
            $table->timestamps();

            // A milestone is issued once. Re-running the sweep must not mint a
            // second certificate with a different serial.
            $table->unique(['user_id', 'milestone']);
            $table->index(['user_id', 'issued_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('certificates');
    }
};
