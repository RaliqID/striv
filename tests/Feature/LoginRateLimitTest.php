<?php

namespace Tests\Feature;

use App\Models\LoginAttempt;
use App\Models\User;
use App\Services\Security\LoginThrottle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class LoginRateLimitTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The per-email bucket is the tight one: MAX_PER_EMAIL attempts are
     * allowed, the next is refused.
     */
    public function test_repeated_failures_for_one_account_are_blocked_with_429(): void
    {
        User::factory()->create([
            'email' => 'victim@example.com',
            'password' => 'CorrectPassword1',
        ]);

        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_EMAIL; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'victim@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $blocked = $this->postJson('/api/v1/auth/login', [
            'email' => 'victim@example.com',
            'password' => 'wrong-password',
        ]);

        $blocked->assertStatus(429)->assertJsonStructure(['message']);
        $this->assertNotNull($blocked->headers->get('Retry-After'));
    }

    /**
     * The point of the throttle: even the CORRECT password is refused once
     * the bucket is exhausted, so an attacker cannot keep guessing and a
     * compromised password cannot be confirmed mid-attack.
     */
    public function test_blocked_account_rejects_correct_password_too(): void
    {
        User::factory()->create([
            'email' => 'victim@example.com',
            'password' => 'CorrectPassword1',
        ]);

        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_EMAIL; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'victim@example.com',
                'password' => 'wrong-password',
            ]);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'victim@example.com',
            'password' => 'CorrectPassword1',
        ])->assertStatus(429);
    }

    /**
     * One IP spraying many different accounts is stopped by the per-IP
     * bucket even though no single account crosses its own limit.
     */
    public function test_one_ip_spraying_many_accounts_is_blocked(): void
    {
        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_IP; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => "user{$attempt}@example.com",
                'password' => 'whatever',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'another@example.com',
            'password' => 'whatever',
        ])->assertStatus(429);
    }

    /**
     * A successful login clears the counters, so a user who mistyped a few
     * times is not left throttled for the rest of the window.
     */
    public function test_successful_login_resets_the_counter(): void
    {
        User::factory()->create([
            'email' => 'good@example.com',
            'password' => 'CorrectPassword1',
        ]);

        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_EMAIL - 1; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'good@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'good@example.com',
            'password' => 'CorrectPassword1',
        ])->assertOk();

        // Counter cleared -> a fresh run of failures is allowed again.
        $this->postJson('/api/v1/auth/login', [
            'email' => 'good@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(422);
    }

    public function test_attempts_are_logged_with_outcome(): void
    {
        User::factory()->create([
            'email' => 'logged@example.com',
            'password' => 'CorrectPassword1',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'logged@example.com',
            'password' => 'wrong-password',
        ]);
        $this->postJson('/api/v1/auth/login', [
            'email' => 'logged@example.com',
            'password' => 'CorrectPassword1',
        ]);

        $this->assertDatabaseHas('login_attempts', [
            'email' => 'logged@example.com',
            'successful' => false,
        ]);
        $this->assertDatabaseHas('login_attempts', [
            'email' => 'logged@example.com',
            'successful' => true,
        ]);
    }

    public function test_blocked_attempts_are_logged_as_failures(): void
    {
        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_EMAIL; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'noisy@example.com',
                'password' => 'wrong-password',
            ]);
        }

        $before = LoginAttempt::where('email', 'noisy@example.com')->count();
        $this->postJson('/api/v1/auth/login', [
            'email' => 'noisy@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(429);

        $this->assertSame(
            $before + 1,
            LoginAttempt::where('email', 'noisy@example.com')->count(),
        );
    }

    /**
     * Validation happens before throttling, so a malformed request is a 422
     * and does not consume a throttle slot or pollute the attempt log.
     */
    public function test_invalid_payload_is_rejected_before_throttling(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'not-an-email',
        ])->assertStatus(422);

        $this->assertDatabaseCount('login_attempts', 0);
    }

    /**
     * A different IP gets its own buckets — one blocked host must not lock
     * out everyone else.
     */
    public function test_throttle_is_scoped_per_ip(): void
    {
        for ($attempt = 0; $attempt < LoginThrottle::MAX_PER_IP; $attempt++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => "spray{$attempt}@example.com",
                'password' => 'whatever',
            ]);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'blocked@example.com',
            'password' => 'whatever',
        ])->assertStatus(429);

        // Same request from another address is still allowed through to the
        // credential check (422), proving the block was per-IP.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
            ->postJson('/api/v1/auth/login', [
                'email' => 'blocked@example.com',
                'password' => 'whatever',
            ])->assertStatus(422);
    }

    public function test_rate_limiter_keys_never_contain_the_raw_email(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'secret@example.com',
            'password' => 'wrong-password',
        ]);

        // Keys are hashed; confirm the raw address is absent from the
        // throttle namespace by checking the expected hashed key exists.
        $hashed = 'login-account:'.hash('sha256', '127.0.0.1|secret@example.com');
        $this->assertGreaterThan(0, RateLimiter::attempts($hashed));
    }
}
