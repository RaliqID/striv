<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_health_endpoint_returns_ok_and_latency(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'timestamp',
                'version',
                'database',
                'latency_ms',
            ])
            ->assertJson([
                'status' => 'ok',
                'database' => 'ok',
            ]);
    }

    public function test_admin_health_endpoint_requires_admin_role(): void
    {
        // Unauthenticated
        $this->getJson('/api/v1/admin/health')
            ->assertStatus(401);

        // Regular athlete user
        $user = User::factory()->create(['role' => User::ROLE_USER]);
        $this->actingAs($user)
            ->getJson('/api/v1/admin/health')
            ->assertStatus(403);
    }

    public function test_admin_health_endpoint_returns_system_and_queue_vitals_for_admin(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);

        $response = $this->actingAs($admin)->getJson('/api/v1/admin/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'timestamp',
                'version',
                'database' => [
                    'status',
                    'latency_ms',
                    'connection',
                    'driver',
                ],
                'queue' => [
                    'status',
                    'driver',
                    'pending_jobs',
                    'failed_jobs',
                ],
                'cache' => [
                    'status',
                    'driver',
                ],
                'storage' => [
                    'status',
                    'writable',
                ],
                'system' => [
                    'php_version',
                    'laravel_version',
                    'memory_usage_mb',
                    'server_time',
                ],
            ])
            ->assertJson([
                'status' => 'ok',
                'database' => ['status' => 'ok'],
                'cache' => ['status' => 'ok'],
                'storage' => ['status' => 'ok', 'writable' => true],
            ]);
    }
}
