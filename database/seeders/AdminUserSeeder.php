<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Promotes the configured accounts to administrator.
 *
 * Emails come from ADMIN_EMAILS (comma-separated). Accounts must already
 * exist — this promotes, it does not create, so no password is ever invented
 * here. Trainers are NOT seeded from this list; they are promoted through the
 * panel or the TrainerSeeder.
 *
 * Note the assignment is idempotent: running it twice changes nothing.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $emails = array_filter(array_map('trim', explode(',', (string) env('ADMIN_EMAILS', ''))));

        if ($emails === []) {
            return;
        }

        User::whereIn('email', $emails)->update(['role' => User::ROLE_ADMIN]);
    }
}
