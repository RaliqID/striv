<?php

namespace Database\Seeders;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Creates the initial trainer accounts.
 *
 * Trainers are real accounts, not fixtures: the matching service only assigns
 * members to a user whose role is `trainer`, so without at least one row here
 * every signup would sit unmatchable. This seeder exists so a fresh install
 * can actually exercise the automatic flow.
 *
 * Idempotent — re-running updates the profile fields of trainers that already
 * exist rather than creating duplicates, so it is safe to run after editing
 * the list below.
 */
class TrainerSeeder extends Seeder
{
    /**
     * Specialisation values line up with the onboarding goals so the matcher's
     * preference ordering has something to match on: muscle / strength /
     * endurance.
     */
    private const TRAINERS = [
        [
            'name' => 'Coach Raka',
            'email' => 'raka@striv.test',
            'specialization' => 'muscle',
            'bio' => 'Hypertrophy specialist. 8 years coaching beginners through their first serious bulk, with an emphasis on technique before load.',
            'capacity' => 20,
        ],
        [
            'name' => 'Coach Dita',
            'email' => 'dita@striv.test',
            'specialization' => 'strength',
            'bio' => 'Powerlifting background. Works on the squat, bench and deadlift with lifters who want to get measurably stronger.',
            'capacity' => 15,
        ],
        [
            'name' => 'Coach Bagas',
            'email' => 'bagas@striv.test',
            'specialization' => 'endurance',
            'bio' => 'Conditioning and work-capacity coach. Builds sustainable weekly volume for members who want to last longer, not just lift heavier.',
            'capacity' => 25,
        ],
    ];

    public function run(): void
    {
        foreach (self::TRAINERS as $data) {
            $trainer = User::firstOrNew(['email' => $data['email']]);

            $trainer->fill([
                'name' => $data['name'],
                'specialization' => $data['specialization'],
                'bio' => $data['bio'],
                'capacity' => $data['capacity'],
                'is_available' => true,
            ]);
            $trainer->role = User::ROLE_TRAINER;

            if (! $trainer->exists) {
                // Only invent a password for accounts we are creating. An
                // existing trainer keeps whatever password they already have.
                $trainer->password = Hash::make('password');
            }

            $trainer->save();

            // A trainer is still a user with a profile; the panel reads
            // experience/onboarding state from it, so give them a completed one.
            if ($trainer->profile === null) {
                Profile::create([
                    'user_id' => $trainer->id,
                    'experience_level' => 'advanced',
                    'onboarding_completed_at' => now(),
                ]);
            }
        }
    }
}
