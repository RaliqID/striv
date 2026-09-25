<?php

namespace Database\Factories;

use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkoutSet>
 */
class WorkoutSetFactory extends Factory
{
    protected $model = WorkoutSet::class;

    public function definition(): array
    {
        return [
            'workout_exercise_id' => WorkoutExercise::factory(),
            'set_number' => 1,
            'weight_kg' => $this->faker->randomFloat(1, 20, 150),
            'reps' => $this->faker->numberBetween(1, 12),
            'rpe' => null,
        ];
    }
}
