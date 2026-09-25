<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Goal;
use App\Models\User;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GoalApiTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create();
    }

    private function exercise(string $name = 'Back Squat'): Exercise
    {
        return Exercise::factory()->create(['name' => $name]);
    }

    /**
     * Log a finished session containing one exercise with the given sets.
     *
     * @param  array<int, array{weight: float, reps: int}>  $sets
     */
    private function logSession(User $user, Exercise $exercise, array $sets): WorkoutSession
    {
        $session = WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => now()->subHour(),
            'finished_at' => now(),
        ]);

        $workoutExercise = WorkoutExercise::factory()->create([
            'workout_session_id' => $session->id,
            'exercise_id' => $exercise->id,
        ]);

        foreach ($sets as $index => $set) {
            WorkoutSet::factory()->create([
                'workout_exercise_id' => $workoutExercise->id,
                'set_number' => $index + 1,
                'weight_kg' => $set['weight'],
                'reps' => $set['reps'],
            ]);
        }

        return $session;
    }

    /**
     * JSON encodes whole floats as integers (60.0 comes back as 60), so
     * numeric equality is asserted through a cast rather than assertSame,
     * which would fail on a correct response.
     */
    private function assertNumber(float $expected, mixed $actual, string $message = ''): void
    {
        $this->assertSame($expected, (float) $actual, $message);
    }

    // ---------------------------------------------------------------- the bug

    /**
     * The original defect: a goal whose target equalled an existing best was
     * created instantly complete. It must now be refused with a clear reason.
     */
    public function test_target_equal_to_current_best_is_rejected(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 30, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 30,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('target_value');
    }

    public function test_target_below_current_best_is_rejected(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 40,
        ])->assertStatus(422)->assertJsonValidationErrors('target_value');
    }

    public function test_a_real_improvement_is_accepted_and_starts_at_the_baseline(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 30, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 50,
        ])->assertStatus(201);

        // Baseline frozen at the existing best, so progress starts at 0.
        $this->assertNumber(30.0, $response->json('starting_value'));
        $this->assertNumber(30.0, $response->json('current_value'));
        $this->assertNumber(0.0, $response->json('progress_percentage'));
        $this->assertNumber(20.0, $response->json('required_delta'));
        $this->assertSame('active', $response->json('status'));
    }

    // ------------------------------------------------------------ rep standard

    /**
     * The rep count must actually matter: a heavy single must not satisfy a
     * goal that demands 5 reps at the target weight.
     */
    public function test_weight_goal_with_target_reps_ignores_heavier_low_rep_sets(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();

        // A 100kg single, but only 60kg for 5 reps.
        $this->logSession($user, $exercise, [
            ['weight' => 100, 'reps' => 1],
            ['weight' => 60, 'reps' => 5],
        ]);

        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 80,
            'target_reps' => 5,
        ])->assertStatus(201);

        // Baseline is 60 (the best set that MEETS the 5-rep standard), not 100.
        $this->assertNumber(60.0, $response->json('starting_value'));
        $this->assertNumber(60.0, $response->json('current_value'));
    }

    public function test_rep_standard_is_honoured_when_progressing(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
            'target_reps' => 5,
        ])->assertStatus(201)->json();

        // Progress to 80kg for 5 reps:
        //   baseline 60 -> target 100, current 80 = 50% of the way.
        $this->logSession($user, $exercise, [['weight' => 80, 'reps' => 5]]);

        $progress = $this->getJson('/api/v1/goals/'.$goal['id'].'/progress')
            ->assertOk()
            ->json();

        $this->assertNumber(80.0, $progress['current_value']);
        $this->assertNumber(50.0, $progress['progress_percentage']);
        $this->assertNumber(20.0, $progress['remaining']);
    }

    /** A heavier set that does NOT meet the rep standard must not advance progress. */
    public function test_heavy_low_rep_set_does_not_advance_a_rep_standard_goal(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
            'target_reps' => 5,
        ])->assertStatus(201)->json();

        // 90kg for only 2 reps — impressive, but not the 5-rep standard.
        $this->logSession($user, $exercise, [['weight' => 90, 'reps' => 2]]);

        $progress = $this->getJson('/api/v1/goals/'.$goal['id'].'/progress')->assertOk()->json();

        $this->assertNumber(60.0, $progress['current_value']);
        $this->assertNumber(0.0, $progress['progress_percentage']);
    }

    /** Raising the rep standard must re-baseline, not compare against the old one. */
    public function test_increasing_target_reps_recomputes_the_baseline(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [
            ['weight' => 100, 'reps' => 1],
            ['weight' => 60, 'reps' => 5],
            ['weight' => 50, 'reps' => 10],
        ]);

        $this->actingAs($user, 'sanctum');

        // Baseline for 5 reps is 60.
        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 90,
            'target_reps' => 5,
        ])->assertStatus(201)->json();

        $this->assertNumber(60.0, $goal['starting_value']);

        // Raising to 10 reps drops the baseline to 50 (the honest 10-rep best).
        $updated = $this->putJson('/api/v1/goals/'.$goal['id'], [
            'target_reps' => 10,
            'target_value' => 90,
        ])->assertOk()->json();

        $this->assertNumber(50.0, $updated['starting_value']);
    }

    // --------------------------------------------------------- auto-complete

    public function test_goal_auto_completes_when_target_is_met(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 80,
        ])->assertStatus(201)->json();

        $this->assertSame('active', $goal['status']);

        $this->logSession($user, $exercise, [['weight' => 80, 'reps' => 5]]);

        $updated = $this->getJson('/api/v1/goals/'.$goal['id'])->assertOk()->json();

        $this->assertSame('completed', $updated['status']);
        $this->assertNumber(100.0, $updated['progress_percentage']);
        $this->assertNotNull($updated['completed_at']);
    }

    /** An in-progress session must not satisfy a goal. */
    public function test_unfinished_session_does_not_advance_progress(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 80,
        ])->assertStatus(201)->json();

        // Same heavy set, but the session is still open.
        $open = WorkoutSession::factory()->create([
            'user_id' => $user->id,
            'started_at' => now(),
            'finished_at' => null,
        ]);
        $workoutExercise = WorkoutExercise::factory()->create([
            'workout_session_id' => $open->id,
            'exercise_id' => $exercise->id,
        ]);
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $workoutExercise->id,
            'set_number' => 1,
            'weight_kg' => 100,
            'reps' => 5,
        ]);

        $progress = $this->getJson('/api/v1/goals/'.$goal['id'].'/progress')->assertOk()->json();
        $this->assertNumber(60.0, $progress['current_value']);
    }

    // ------------------------------------------------------------ workouts type

    /** A workout-count goal tracks sessions completed AFTER it was set. */
    public function test_workouts_goal_counts_only_sessions_after_creation(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();

        // Three sessions already logged before the goal exists.
        $this->logSession($user, $exercise, [['weight' => 50, 'reps' => 5]]);
        $this->logSession($user, $exercise, [['weight' => 50, 'reps' => 5]]);
        $this->logSession($user, $exercise, [['weight' => 50, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'target_type' => 'workouts',
            'target_value' => 10,
        ])->assertStatus(201)->json();

        // Baseline is the existing count, so nothing is "already done".
        $this->assertNumber(3.0, $goal['starting_value']);
        $this->assertNumber(0.0, $goal['progress_percentage']);
        $this->assertSame('workouts', $goal['unit']);
    }

    public function test_workouts_goal_does_not_require_an_exercise(): void
    {
        $user = $this->user();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/goals', [
            'target_type' => 'workouts',
            'target_value' => 12,
        ])->assertStatus(201);
    }

    public function test_exercise_scoped_goal_requires_an_exercise(): void
    {
        $user = $this->user();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/goals', [
            'target_type' => 'weight',
            'target_value' => 100,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('exercise_id');
    }

    // -------------------------------------------------------------- list shape

    /** Progress is embedded in the list, removing the per-goal request storm. */
    public function test_index_includes_progress_without_extra_requests(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');
        $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
        ])->assertStatus(201);

        $list = $this->getJson('/api/v1/goals')->assertOk()->json();

        $this->assertCount(1, $list['data']);
        $this->assertArrayHasKey('progress_percentage', $list['data'][0]);
        $this->assertArrayHasKey('current_value', $list['data'][0]);
        $this->assertArrayHasKey('unit', $list['data'][0]);
        $this->assertArrayHasKey('starting_value', $list['data'][0]);
    }

    /** Active goals come first so the list leads with what still needs work. */
    public function test_active_goals_are_listed_before_completed(): void
    {
        $user = $this->user();
        $squat = $this->exercise('Back Squat');
        $bench = $this->exercise('Bench Press');
        $this->logSession($user, $squat, [['weight' => 60, 'reps' => 5]]);
        $this->logSession($user, $bench, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        // One goal that will be achieved, one that will not.
        $this->postJson('/api/v1/goals', [
            'exercise_id' => $squat->id,
            'target_type' => 'weight',
            'target_value' => 61,
        ])->assertStatus(201);

        $this->postJson('/api/v1/goals', [
            'exercise_id' => $bench->id,
            'target_type' => 'weight',
            'target_value' => 200,
        ])->assertStatus(201);

        // Push the squat goal over the line.
        $this->logSession($user, $squat, [['weight' => 65, 'reps' => 5]]);

        $list = $this->getJson('/api/v1/goals')->assertOk()->json();
        $statuses = array_column($list['data'], 'status');

        $this->assertSame('active', $statuses[0]);
        $this->assertContains('completed', $statuses);
    }

    // ------------------------------------------------------------------ update

    public function test_update_rejects_a_target_below_the_baseline(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
        ])->assertStatus(201)->json();

        $this->putJson('/api/v1/goals/'.$goal['id'], ['target_value' => 50])
            ->assertStatus(422)
            ->assertJsonValidationErrors('target_value');
    }

    public function test_a_completed_goal_reads_back_as_complete(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 80,
        ])->assertStatus(201)->json();

        $this->logSession($user, $exercise, [['weight' => 80, 'reps' => 5]]);

        // First read detects the achievement and persists completion.
        $this->getJson('/api/v1/goals/'.$goal['id'])->assertOk();

        $this->assertDatabaseHas('goals', [
            'id' => $goal['id'],
            'status' => 'completed',
        ]);
    }

    public function test_deadline_in_the_past_is_rejected(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
            'deadline' => now()->subWeek()->toDateString(),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('deadline');
    }

    /** Goals belong to their owner only. */
    public function test_other_users_cannot_touch_a_goal(): void
    {
        $owner = $this->user();
        $other = User::factory()->create();
        $exercise = $this->exercise();

        $goal = Goal::create([
            'user_id' => $owner->id,
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
            'starting_value' => 0,
            'status' => 'active',
        ]);

        $this->actingAs($other, 'sanctum');

        $this->getJson('/api/v1/goals/'.$goal->id)->assertStatus(403);
        $this->putJson('/api/v1/goals/'.$goal->id, ['target_value' => 200])->assertStatus(403);
        $this->deleteJson('/api/v1/goals/'.$goal->id)->assertStatus(403);
    }

    /** The baseline is frozen: a later PR must not move the starting line. */
    public function test_baseline_does_not_drift_when_a_new_record_is_set(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
        ])->assertStatus(201)->json();

        $this->assertNumber(60.0, $goal['starting_value']);

        // A big jump that beats the goal outright.
        $this->logSession($user, $exercise, [['weight' => 110, 'reps' => 5]]);

        $after = $this->getJson('/api/v1/goals/'.$goal['id'])->assertOk()->json();

        $this->assertNumber(60.0, $after['starting_value']);
        $this->assertSame('completed', $after['status']);
        $this->assertNumber(100.0, $after['progress_percentage']);
    }

    /** Progress must never report above 100 or below 0. */
    public function test_progress_is_clamped_to_the_valid_range(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 60, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $goal = $this->postJson('/api/v1/goals', [
            'exercise_id' => $exercise->id,
            'target_type' => 'weight',
            'target_value' => 100,
        ])->assertStatus(201)->json();

        // Far beyond the target.
        $this->logSession($user, $exercise, [['weight' => 300, 'reps' => 5]]);

        $progress = $this->getJson('/api/v1/goals/'.$goal['id'].'/progress')->assertOk()->json();

        $this->assertNumber(100.0, $progress['progress_percentage']);
        $this->assertNumber(0.0, $progress['remaining']);
    }

    // ------------------------------------------------------------ baseline probe

    /** The form's live baseline must match what creation will freeze. */
    public function test_baseline_endpoint_reports_current_best(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [['weight' => 75, 'reps' => 5]]);

        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/goals/baseline?target_type=weight&exercise_id='.$exercise->id)
            ->assertOk()
            ->assertJsonPath('current_value', 75)
            ->assertJsonPath('target_type', 'weight');
    }

    public function test_baseline_endpoint_honours_the_rep_standard(): void
    {
        $user = $this->user();
        $exercise = $this->exercise();
        $this->logSession($user, $exercise, [
            ['weight' => 100, 'reps' => 1],
            ['weight' => 60, 'reps' => 5],
        ]);

        $this->actingAs($user, 'sanctum');

        // Without a rep standard, the heaviest set wins.
        $this->getJson('/api/v1/goals/baseline?target_type=weight&exercise_id='.$exercise->id)
            ->assertOk()
            ->assertJsonPath('current_value', 100);

        // With a 5-rep standard, only the 60kg set qualifies.
        $this->getJson('/api/v1/goals/baseline?target_type=weight&exercise_id='.$exercise->id.'&target_reps=5')
            ->assertOk()
            ->assertJsonPath('current_value', 60);
    }

    /** The route must not be swallowed by the /goals/{goal} wildcard. */
    public function test_baseline_route_is_not_treated_as_a_goal_id(): void
    {
        $user = $this->user();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/goals/baseline?target_type=workouts')
            ->assertOk()
            ->assertJsonStructure(['target_type', 'current_value']);
    }

    public function test_baseline_requires_a_valid_target_type(): void
    {
        $user = $this->user();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/goals/baseline?target_type=nonsense')
            ->assertStatus(422)
            ->assertJsonValidationErrors('target_type');
    }
}
