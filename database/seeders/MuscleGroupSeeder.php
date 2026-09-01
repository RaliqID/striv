<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\MuscleGroup;

class MuscleGroupSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            ['name' => 'Chest', 'slug' => 'chest'],
            ['name' => 'Back', 'slug' => 'back'],
            ['name' => 'Shoulders', 'slug' => 'shoulders'],
            ['name' => 'Biceps', 'slug' => 'biceps'],
            ['name' => 'Triceps', 'slug' => 'triceps'],
            ['name' => 'Legs', 'slug' => 'legs'],
            ['name' => 'Core', 'slug' => 'core'],
        ];

        foreach ($groups as $group) {
            MuscleGroup::create($group);
        }
    }
}