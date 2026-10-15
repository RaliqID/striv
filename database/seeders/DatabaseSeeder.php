<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            MuscleGroupSeeder::class,
            ExerciseSeeder::class,
            // Trainers must exist before members sign up, otherwise the
            // automatic matcher has nobody to assign and every request sits
            // pending. Safe to run repeatedly.
            TrainerSeeder::class,
            AdminUserSeeder::class,
            // Full demo fixture: pro trainers + accounts covering every
            // lifecycle stage. Run with --class=DemoSeeder for that alone.
            DemoSeeder::class,
        ]);
    }
}