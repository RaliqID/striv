<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use App\Models\WeightLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WeightLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_access_weight_history(): void
    {
        $this->getJson('/api/v1/profile/weight-history')->assertStatus(401);
        $this->postJson('/api/v1/profile/weight-history', ['weight_kg' => 75])->assertStatus(401);
    }

    public function test_user_can_fetch_empty_weight_history(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_USER]);

        $response = $this->actingAs($user)->getJson('/api/v1/profile/weight-history');

        $response->assertStatus(200)
            ->assertJson([
                'logs' => [],
                'current_weight_kg' => null,
                'target_weight_kg' => null,
                'change_kg' => 0.0,
                'bmi' => null,
            ]);
    }

    public function test_user_can_log_weight_and_syncs_profile(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_USER]);
        Profile::create([
            'user_id' => $user->id,
            'height_cm' => 180,
            'target_weight_kg' => 75.0,
        ]);

        $payload = [
            'weight_kg' => 80.5,
            'date' => now()->format('Y-m-d'),
            'notes' => 'Morning weigh-in',
        ];

        $response = $this->actingAs($user)->postJson('/api/v1/profile/weight-history', $payload);

        $response->assertStatus(201)
            ->assertJson([
                'message' => 'Bodyweight logged successfully.',
                'log' => [
                    'weight_kg' => 80.5,
                    'notes' => 'Morning weigh-in',
                ],
            ]);

        $this->assertDatabaseHas('weight_logs', [
            'user_id' => $user->id,
            'weight_kg' => 80.5,
            'notes' => 'Morning weigh-in',
        ]);

        // Check profile updated
        $this->assertDatabaseHas('user_profiles', [
            'user_id' => $user->id,
            'weight_kg' => 80.5,
        ]);

        // Check history retrieval & BMI
        // BMI = 80.5 / (1.8^2) = 80.5 / 3.24 = 24.8 (normal)
        $historyRes = $this->actingAs($user)->getJson('/api/v1/profile/weight-history');
        $historyRes->assertStatus(200)
            ->assertJson([
                'current_weight_kg' => 80.5,
                'target_weight_kg' => 75.0,
                'height_cm' => 180.0,
                'bmi' => 24.8,
                'bmi_category' => 'normal',
            ]);
    }

    public function test_logging_same_date_updates_existing_record(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_USER]);
        $date = now()->subDays(2)->format('Y-m-d');

        $this->actingAs($user)->postJson('/api/v1/profile/weight-history', [
            'weight_kg' => 82.0,
            'date' => $date,
        ])->assertStatus(201);

        $this->actingAs($user)->postJson('/api/v1/profile/weight-history', [
            'weight_kg' => 81.5,
            'date' => $date,
            'notes' => 'Corrected scale reading',
        ])->assertStatus(201);

        $this->assertEquals(1, WeightLog::where('user_id', $user->id)->count());
        $this->assertDatabaseHas('weight_logs', [
            'user_id' => $user->id,
            'weight_kg' => 81.5,
            'notes' => 'Corrected scale reading',
        ]);
    }

    public function test_weight_validation_rules(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_USER]);

        // Weight out of bounds (<20 or >400)
        $this->actingAs($user)->postJson('/api/v1/profile/weight-history', [
            'weight_kg' => 10,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['weight_kg']);

        // Future date forbidden
        $this->actingAs($user)->postJson('/api/v1/profile/weight-history', [
            'weight_kg' => 75,
            'date' => now()->addDays(5)->format('Y-m-d'),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['date']);
    }

    public function test_user_can_delete_own_weight_log(): void
    {
        $user = User::factory()->create(['role' => User::ROLE_USER]);
        $log = WeightLog::create([
            'user_id' => $user->id,
            'weight_kg' => 78.0,
            'logged_at' => now()->subDay()->format('Y-m-d'),
        ]);

        $this->actingAs($user)->deleteJson("/api/v1/profile/weight-history/{$log->id}")
            ->assertStatus(200);

        $this->assertDatabaseMissing('weight_logs', ['id' => $log->id]);
    }

    public function test_user_cannot_delete_another_users_weight_log(): void
    {
        $userA = User::factory()->create(['role' => User::ROLE_USER]);
        $userB = User::factory()->create(['role' => User::ROLE_USER]);

        $logB = WeightLog::create([
            'user_id' => $userB->id,
            'weight_kg' => 78.0,
            'logged_at' => now()->subDay()->format('Y-m-d'),
        ]);

        $this->actingAs($userA)->deleteJson("/api/v1/profile/weight-history/{$logB->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('weight_logs', ['id' => $logB->id]);
    }
}
