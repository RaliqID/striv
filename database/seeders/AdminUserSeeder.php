<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $emails = array_filter(array_map('trim', explode(',', (string) env('ADMIN_EMAILS', ''))));

        if ($emails === []) {
            return;
        }

        User::whereIn('email', $emails)->update(['is_admin' => true]);
    }
}
