<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsHeatmapTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_is_rejected(): void
    {
        $response = $this->getJson('/api/v1/analytics/heatmap');

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_receives_valid_json_structure(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap');

        $response->assertOk()
            ->assertJsonStructure([
                'dates',
                'current_streak_days',
                'best_streak_days',
                'total_active_days',
            ]);

        $this->assertIsArray($response->json('dates'));
        $this->assertSame(0, $response->json('current_streak_days'));
        $this->assertSame(0, $response->json('best_streak_days'));
        $this->assertSame(0, $response->json('total_active_days'));
    }

    public function test_workout_sessions_are_counted_on_correct_date(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::factory()->create();

        $targetDate = Carbon::now()->subDays(3)->startOfDay()->addHours(10);

        $session = WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => $targetDate,
            'finished_at' => $targetDate->copy()->addMinutes(45),
        ]);

        $we = WorkoutExercise::factory()->create([
            'workout_session_id' => $session->id,
            'exercise_id' => $exercise->id,
        ]);

        WorkoutSet::factory()->create([
            'workout_exercise_id' => $we->id,
            'set_number' => 1,
            'weight_kg' => 80.0,
            'reps' => 10,
        ]);

        WorkoutSet::factory()->create([
            'workout_exercise_id' => $we->id,
            'set_number' => 2,
            'weight_kg' => 100.0,
            'reps' => 5,
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap');

        $response->assertOk();
        $this->assertSame(1, $response->json('total_active_days'));

        $expectedDate = $targetDate->toDateString();
        $dates = $response->json('dates');
        $this->assertCount(1, $dates);

        $record = $dates[0];
        $this->assertSame($expectedDate, $record['date']);
        $this->assertSame(1, $record['count']);
        $this->assertSame(2, $record['sets']);
        // 80 * 10 + 100 * 5 = 800 + 500 = 1300
        $this->assertSame(1300.0, (float) $record['volume']);
    }

    public function test_in_progress_sessions_are_not_counted(): void
    {
        $user = User::factory()->create();

        WorkoutSession::factory()->inProgress()->create([
            'user_id' => $user->id,
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap');

        $response->assertOk();
        $this->assertEmpty($response->json('dates'));
        $this->assertSame(0, $response->json('total_active_days'));
    }

    public function test_other_users_sessions_are_isolated(): void
    {
        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        WorkoutSession::factory()->create([
            'user_id' => $user2->id,
            'started_at' => Carbon::now()->subDay(),
            'finished_at' => Carbon::now()->subDay()->addHour(),
        ]);

        $response = $this->actingAs($user1, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap');

        $response->assertOk();
        $this->assertEmpty($response->json('dates'));
        $this->assertSame(0, $response->json('total_active_days'));
    }

    public function test_streaks_are_computed_correctly_for_consecutive_days(): void
    {
        $user = User::factory()->create();

        WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->subDay()->startOfDay()->addHours(9),
            'finished_at' => Carbon::now()->subDay()->startOfDay()->addHours(10),
        ]);

        WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->startOfDay()->addHours(8),
            'finished_at' => Carbon::now()->startOfDay()->addHours(9),
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap');

        $response->assertOk();
        $this->assertSame(2, $response->json('current_streak_days'));
        $this->assertSame(2, $response->json('best_streak_days'));
        $this->assertSame(2, $response->json('total_active_days'));
    }

    public function test_custom_weeks_query_parameter_filters_window(): void
    {
        $user = User::factory()->create();

        // 10 weeks ago session
        WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->subWeeks(10)->startOfDay()->addHours(12),
            'finished_at' => Carbon::now()->subWeeks(10)->startOfDay()->addHours(13),
        ]);

        // Querying with weeks=4 should not return the 10-week-old session
        $res4 = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap?weeks=4');

        $res4->assertOk();
        $this->assertEmpty($res4->json('dates'));

        // Querying with weeks=12 should return it
        $res12 = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/analytics/heatmap?weeks=12');

        $res12->assertOk();
        $this->assertCount(1, $res12->json('dates'));
    }
}
