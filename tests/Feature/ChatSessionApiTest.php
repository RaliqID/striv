<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChatSessionApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_all_sessions_newest_first(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $first = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);
        $second = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);

        $first->forceFill(['last_message_at' => now()->subHour()])->save();
        $second->forceFill(['last_message_at' => now()])->save();

        $response = $this->getJson('/api/v1/chat/sessions');

        $response->assertStatus(200)
            ->assertJsonCount(2, 'sessions')
            ->assertJsonPath('sessions.0.id', $second->id)
            ->assertJsonPath('sessions.1.id', $first->id);

        // Only own sessions — other users' sessions never leak.
        $other = User::factory()->create();
        ChatSession::create(['user_id' => $other->id, 'title' => 'New chat']);

        $this->getJson('/api/v1/chat/sessions')
            ->assertStatus(200)
            ->assertJsonCount(2, 'sessions');
    }

    public function test_store_creates_session(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/chat/sessions');

        $response->assertStatus(201)
            ->assertJsonStructure([
                'session' => ['id', 'title', 'last_message_at', 'created_at'],
            ])
            ->assertJsonPath('session.title', 'New chat');

        $this->assertDatabaseHas('chat_sessions', [
            'user_id' => $user->id,
            'title' => 'New chat',
        ]);
    }

    public function test_show_returns_session_with_messages(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $session = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);

        ChatMessage::create([
            'user_id' => $user->id,
            'chat_session_id' => $session->id,
            'role' => 'user',
            'content' => 'hello coach',
        ]);
        ChatMessage::create([
            'user_id' => $user->id,
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'content' => 'hi there',
        ]);

        $response = $this->getJson("/api/v1/chat/sessions/{$session->id}");

        $response->assertStatus(200)
            ->assertJsonPath('session.id', $session->id)
            ->assertJsonCount(2, 'messages')
            ->assertJsonPath('messages.0.role', 'user')
            ->assertJsonPath('messages.0.content', 'hello coach')
            ->assertJsonPath('messages.1.role', 'assistant');
    }

    public function test_show_returns_404_for_other_users_session(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $other = User::factory()->create();
        $session = ChatSession::create(['user_id' => $other->id, 'title' => 'New chat']);

        $this->getJson("/api/v1/chat/sessions/{$session->id}")
            ->assertStatus(404);
    }

    public function test_show_returns_404_for_nonexistent_session(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/chat/sessions/99999')
            ->assertStatus(404);
    }

    public function test_destroy_deletes_session(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $session = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);

        ChatMessage::create([
            'user_id' => $user->id,
            'chat_session_id' => $session->id,
            'role' => 'user',
            'content' => 'bye',
        ]);

        $response = $this->deleteJson("/api/v1/chat/sessions/{$session->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('chat_sessions', ['id' => $session->id]);
        $this->assertDatabaseMissing('chat_messages', ['chat_session_id' => $session->id]);
    }

    public function test_destroy_returns_404_for_other_users_session(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $other = User::factory()->create();
        $session = ChatSession::create(['user_id' => $other->id, 'title' => 'New chat']);

        $this->deleteJson("/api/v1/chat/sessions/{$session->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('chat_sessions', ['id' => $session->id]);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/chat/sessions')->assertStatus(401);
        $this->postJson('/api/v1/chat/sessions')->assertStatus(401);
        $this->getJson('/api/v1/chat/sessions/1')->assertStatus(401);
        $this->deleteJson('/api/v1/chat/sessions/1')->assertStatus(401);
    }
}
