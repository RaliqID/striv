<?php

namespace Database\Factories;

use App\Models\Exercise;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Exercise>
 */
class ExerciseFactory extends Factory
{
    protected $model = Exercise::class;

    public function definition(): array
    {
        // Name is generated first and the slug derived from it, so the unique
        // slug constraint cannot collide across a batch of factory rows.
        $name = ucwords($this->faker->unique()->words(2, true));

        return [
            'name' => $name,
            'slug' => Str::slug($name).'-'.$this->faker->unique()->numberBetween(1, 100000),
            'category' => 'strength',
            'movement_pattern' => 'squat',
            'equipment' => 'barbell',
        ];
    }
}
