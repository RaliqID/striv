<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_creates_user_with_token_and_profile(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token'])
            ->assertJsonPath('user.email', 'test@example.com');

        $this->assertNotEmpty($response->json('token'));

        $user = User::where('email', 'test@example.com')->first();
        $this->assertNotNull($user);
        $this->assertDatabaseCount('user_profiles', 1);
        $this->assertNotNull($user->profile);

        // Empty profile -> needs onboarding.
        $this->assertNull($user->profile->onboarding_completed_at);
    }

    public function test_register_duplicate_email_returns_422(): void
    {
        User::factory()->create(['email' => 'dup@example.com']);

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Second User',
            'email' => 'dup@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame(1, User::where('email', 'dup@example.com')->count());
    }

    public function test_register_with_mismatched_password_confirmation_returns_422(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Mismatch',
            'email' => 'mismatch@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Different123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_login_with_wrong_password_returns_422(): void
    {
        User::factory()->create([
            'email' => 'login@example.com',
            'password' => 'CorrectPassword1',
        ]);

        // ValidationException from AuthController -> 422 with email error.
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_login_with_unknown_email_returns_422(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'ghost@example.com',
            'password' => 'whatever',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_login_with_correct_credentials_returns_token(): void
    {
        User::factory()->create([
            'email' => 'ok@example.com',
            'password' => 'Password123',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'ok@example.com',
            'password' => 'Password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('user.email', 'ok@example.com');

        $this->assertNotEmpty($response->json('token'));
    }

    public function test_user_endpoint_requires_token(): void
    {
        $this->getJson('/api/v1/auth/user')->assertStatus(401);
    }

    public function test_user_endpoint_with_bearer_token_returns_user(): void
    {
        $user = User::factory()->create(['email' => 'me@example.com']);
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/auth/user');

        $response->assertStatus(200)
            ->assertJsonPath('email', 'me@example.com');
    }

    public function test_exchange_oauth_token_with_valid_code_returns_user_and_token(): void
    {
        $user = User::factory()->create(['email' => 'oauth@example.com']);
        $token = 'sample-sanctum-token';
        $code = 'valid-test-code-12345';

        \Illuminate\Support\Facades\Cache::put("oauth_code:{$code}", [
            'token' => $token,
            'user_id' => $user->id,
        ], now()->addSeconds(60));

        $response = $this->postJson('/api/v1/auth/exchange-token', ['code' => $code]);

        $response->assertStatus(200)
            ->assertJsonPath('token', $token)
            ->assertJsonPath('user.email', 'oauth@example.com');

        // Verify one-time use: cache is pulled
        $this->assertNull(\Illuminate\Support\Facades\Cache::get("oauth_code:{$code}"));
    }

    public function test_exchange_oauth_token_with_invalid_code_returns_400(): void
    {
        $response = $this->postJson('/api/v1/auth/exchange-token', ['code' => 'invalid-code']);
        $response->assertStatus(400);
    }

    public function test_user_role_and_suspension_are_guarded_against_mass_assignment(): void
    {
        $user = new User([
            'name' => 'Mass Assigner',
            'email' => 'mass@example.com',
            'password' => 'secret123',
            'role' => User::ROLE_ADMIN,
            'is_suspended' => true,
        ]);

        $this->assertNotSame(User::ROLE_ADMIN, $user->role);
        $this->assertNotSame(true, $user->is_suspended);
    }
}
