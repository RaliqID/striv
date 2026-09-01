<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->unsignedTinyInteger('age')->nullable()->after('user_id');
            $table->string('location')->nullable()->after('age');
            $table->decimal('weight_kg', 8, 2)->nullable()->after('location');
            $table->decimal('height_cm', 8, 2)->nullable()->after('weight_kg');
            $table->decimal('target_weight_kg', 8, 2)->nullable()->after('height_cm');
        });
    }

    public function down(): void
    {
        Schema::table('user_profiles', function (Blueprint $table) {
            $table->dropColumn(['age', 'location', 'weight_kg', 'height_cm', 'target_weight_kg']);
        });
    }
};
