<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/admin/stats')->assertStatus(401);
    }

    public function test_non_admin_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        foreach ([
            ['getJson', '/api/v1/admin/stats'],
            ['getJson', '/api/v1/admin/users'],
            ['getJson', '/api/v1/admin/users/1'],
            ['postJson', '/api/v1/admin/users/1/suspend'],
            ['postJson', '/api/v1/admin/users/1/unsuspend'],
        ] as [$method, $uri]) {
            $this->{$method}($uri)->assertStatus(403)
                ->assertJson(['message' => 'Admin access required.']);
        }
    }

    public function test_admin_can_read_stats_and_users(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        User::factory()->count(3)->create();
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/admin/stats')
            ->assertOk()
            ->assertJsonStructure([
                'total_users', 'new_users_7d', 'active_users_30d',
                'suspended_users', 'total_workouts', 'workouts_30d',
                'total_sets', 'volume_30d_kg', 'chat_messages_30d',
                'ai_image_messages_30d', 'signups_series', 'top_exercises',
            ]);

        $this->getJson('/api/v1/admin/users?per_page=2')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['current_page', 'per_page', 'total', 'last_page']])
            ->assertJsonCount(2, 'data');
    }

    public function test_admin_can_show_missing_user_and_manage_suspension(): void
    {
        $admin = User::factory()->create(['is_admin' => true, 'email' => 'admin@example.com']);
        $target = User::factory()->create(['email' => 'target@example.com', 'password' => 'Password123']);
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/admin/users/'.$target->id)
            ->assertOk()
            ->assertJsonStructure(['user', 'profile', 'recent_workouts', 'stats', 'chat_sessions']);

        $this->getJson('/api/v1/admin/users/999999')->assertStatus(404);

        $this->postJson('/api/v1/admin/users/'.$target->id.'/suspend')
            ->assertOk()
            ->assertJsonPath('user.is_suspended', true);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'target@example.com',
            'password' => 'Password123',
        ])->assertStatus(403)->assertJson(['message' => 'Account suspended. Contact support.']);

        $this->postJson('/api/v1/admin/users/'.$target->id.'/unsuspend')
            ->assertOk()
            ->assertJsonPath('user.is_suspended', false);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'target@example.com',
            'password' => 'Password123',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_admin_cannot_suspend_self(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$admin->id.'/suspend')
            ->assertStatus(422)
            ->assertJson(['message' => 'You cannot suspend your own account.']);
    }
}
