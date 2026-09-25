<?php

namespace Tests\Feature;

use App\Models\User;
use App\Providers\ProductionSafetyProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards that keep the app safe to expose publicly.
 *
 * These assert two kinds of thing: that the production safety checks actually
 * refuse to boot with dangerous configuration, and that the public endpoints
 * are rate limited so the app cannot be used to mass-create accounts or be
 * enumeration-probed.
 */
class PublicHardeningTest extends TestCase
{
    use RefreshDatabase;

    // ------------------------------------------------- production safety gate

    /**
     * Runs the provider's checks with the given config, expecting a refusal.
     */
    private function assertUnsafeConfigIsRejected(callable $configure): void
    {
        $configure();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Unsafe production configuration');

        (new ProductionSafetyProvider($this->app))->boot();
    }

    public function test_production_refuses_to_boot_with_debug_enabled(): void
    {
        $this->assertUnsafeConfigIsRejected(function () {
            $this->app['env'] = 'production';
            config(['app.debug' => true, 'app.key' => 'base64:abc', 'app.url' => 'https://api.example.com']);
            config(['cors.allowed_origins' => ['https://app.example.com']]);
        });
    }

    public function test_production_refuses_to_boot_with_wildcard_cors(): void
    {
        $this->assertUnsafeConfigIsRejected(function () {
            $this->app['env'] = 'production';
            config(['app.debug' => false, 'app.key' => 'base64:abc', 'app.url' => 'https://api.example.com']);
            config(['cors.allowed_origins' => ['*']]);
        });
    }

    public function test_production_refuses_to_boot_without_app_key(): void
    {
        $this->assertUnsafeConfigIsRejected(function () {
            $this->app['env'] = 'production';
            config(['app.debug' => false, 'app.key' => '', 'app.url' => 'https://api.example.com']);
            config(['cors.allowed_origins' => ['https://app.example.com']]);
        });
    }

    public function test_production_refuses_to_boot_on_plain_http(): void
    {
        $this->assertUnsafeConfigIsRejected(function () {
            $this->app['env'] = 'production';
            config(['app.debug' => false, 'app.key' => 'base64:abc', 'app.url' => 'http://api.example.com']);
            config(['cors.allowed_origins' => ['https://app.example.com']]);
        });
    }

    public function test_production_boots_with_safe_configuration(): void
    {
        $this->app['env'] = 'production';
        config([
            'app.debug' => false,
            'app.key' => 'base64:abc',
            'app.url' => 'https://api.example.com',
            'cors.allowed_origins' => ['https://app.example.com'],
        ]);

        // No exception: the safe configuration is accepted.
        (new ProductionSafetyProvider($this->app))->boot();
        $this->assertTrue(true);
    }

    public function test_non_production_is_not_gated(): void
    {
        // Local dev with debug on must keep working.
        $this->app['env'] = 'local';
        config(['app.debug' => true, 'cors.allowed_origins' => ['*']]);

        (new ProductionSafetyProvider($this->app))->boot();
        $this->assertTrue(true);
    }

    // ------------------------------------------------------ register throttle

    public function test_register_is_rate_limited_per_ip(): void
    {
        // Route allows 5 per minute; the 6th must be refused.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/register', [
                'name' => "User {$i}",
                'email' => "user{$i}@example.com",
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ]);
        }

        $this->postJson('/api/v1/auth/register', [
            'name' => 'One Too Many',
            'email' => 'toomany@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(429);
    }

    public function test_rate_limited_register_creates_no_account(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/register', [
                'name' => "User {$i}",
                'email' => "user{$i}@example.com",
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ]);
        }

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Blocked',
            'email' => 'blocked@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(429);

        $this->assertDatabaseMissing('users', ['email' => 'blocked@example.com']);
    }

    // ------------------------------------------------------- security headers

    public function test_security_headers_are_present_on_responses(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $response = $this->getJson('/api/v1/auth/user')->assertOk();

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString(
            "default-src 'none'",
            (string) $response->headers->get('Content-Security-Policy')
        );
        $this->assertStringContainsString(
            'camera=()',
            (string) $response->headers->get('Permissions-Policy')
        );
    }

    /** Headers must be present on failures too, not just successes. */
    public function test_security_headers_are_present_on_error_responses(): void
    {
        $this->getJson('/api/v1/auth/user')
            ->assertStatus(401)
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    /** HSTS only makes sense over HTTPS and would break local dev otherwise. */
    public function test_hsts_is_absent_over_plain_http(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/auth/user')
            ->assertOk()
            ->assertHeaderMissing('Strict-Transport-Security');
    }

    // ------------------------------------------------------------------- cors

    public function test_cors_defaults_to_the_local_frontend_not_a_wildcard(): void
    {
        // The shipped default must be a specific origin. A wildcard default
        // would let any website call the API with a signed-in user's token.
        $default = config('cors.allowed_origins');

        $this->assertIsArray($default);
        $this->assertNotContains('*', $default);
    }
}
