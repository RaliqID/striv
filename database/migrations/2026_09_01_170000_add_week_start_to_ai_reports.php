<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_reports', function (Blueprint $table) {
            $table->date('week_start')->nullable()->after('type')->index();
        });
    }

    public function down(): void
    {
        Schema::table('ai_reports', function (Blueprint $table) {
            $table->dropIndex(['week_start']);
            $table->dropColumn('week_start');
        });
    }
};
