<?php

namespace Tests\Feature;

use App\Models\AiReport;
use App\Models\Exercise;
use App\Models\User;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConsoleCommandsTest extends TestCase
{
    use RefreshDatabase;

    public function test_cleanup_abandoned_sessions_deletes_empty_drafts(): void
    {
        $user = User::factory()->create();

        // 1. Abandoned empty session (>24h) -> should be deleted
        $emptySession = WorkoutSession::create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->subHours(48),
            'finished_at' => null,
        ]);

        // 2. Recent empty session (<24h) -> should remain untouched
        $recentSession = WorkoutSession::create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->subHours(2),
            'finished_at' => null,
        ]);

        $this->artisan('striv:cleanup-abandoned-sessions --hours=24')
            ->assertSuccessful();

        $this->assertDatabaseMissing('workout_sessions', ['id' => $emptySession->id]);
        $this->assertDatabaseHas('workout_sessions', ['id' => $recentSession->id]);
    }

    public function test_cleanup_abandoned_sessions_auto_closes_sessions_with_sets(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create([
            'name' => 'Barbell Bench Press',
            'slug' => 'barbell-bench-press',
            'category' => 'chest',
            'equipment' => 'barbell',
        ]);

        $session = WorkoutSession::create([
            'user_id' => $user->id,
            'started_at' => Carbon::now()->subHours(30),
            'finished_at' => null,
        ]);

        $we = WorkoutExercise::create([
            'workout_session_id' => $session->id,
            'exercise_id' => $exercise->id,
            'order' => 1,
        ]);

        WorkoutSet::create([
            'workout_exercise_id' => $we->id,
            'set_number' => 1,
            'weight_kg' => 80.0,
            'reps' => 8,
        ]);

        $this->artisan('striv:cleanup-abandoned-sessions --hours=24')
            ->assertSuccessful();

        $session->refresh();

        $this->assertNotNull($session->finished_at);
        $this->assertGreaterThan(0, $session->duration_minutes);
        $this->assertStringContainsString('Auto-closed', $session->notes);
    }

    public function test_generate_weekly_reviews_runs_for_active_members(): void
    {
        $user = User::factory()->create();
        $lastMonday = Carbon::now()->subWeek()->startOfWeek();

        // Finished workout in the target week
        WorkoutSession::create([
            'user_id' => $user->id,
            'started_at' => $lastMonday->copy()->addDays(1)->setHour(10),
            'finished_at' => $lastMonday->copy()->addDays(1)->setHour(11),
            'duration_minutes' => 60,
        ]);

        $this->artisan('striv:generate-weekly-reviews --weeks-ago=1')
            ->assertSuccessful();

        $this->assertDatabaseHas('ai_reports', [
            'user_id' => $user->id,
            'type' => 'weekly',
        ]);

        // Re-running is idempotent and passes
        $this->artisan('striv:generate-weekly-reviews --weeks-ago=1')
            ->assertSuccessful();

        $this->assertEquals(1, AiReport::where('user_id', $user->id)->count());
    }
}
