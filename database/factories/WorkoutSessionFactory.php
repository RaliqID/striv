<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkoutSession>
 */
class WorkoutSessionFactory extends Factory
{
    protected $model = WorkoutSession::class;

    /** Sessions default to finished: an open session is the exception worth stating. */
    public function definition(): array
    {
        $startedAt = $this->faker->dateTimeBetween('-30 days', '-1 hour');

        return [
            'user_id' => User::factory(),
            'started_at' => $startedAt,
            'finished_at' => (clone $startedAt)->modify('+60 minutes'),
            'duration_minutes' => 60,
            'notes' => null,
        ];
    }

    /** An in-progress session (never satisfies a goal). */
    public function inProgress(): static
    {
        return $this->state(fn () => [
            'started_at' => now(),
            'finished_at' => null,
            'duration_minutes' => null,
        ]);
    }
}
