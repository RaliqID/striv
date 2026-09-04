<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Services\AI\AIInsightService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ChatApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // No AI providers configured -> ChatService falls back to offlineReply().
        $this->mock(AIInsightService::class, function ($mock) {
            $mock->shouldReceive('providers')->andReturn([]);
            $mock->shouldReceive('visionProvider')->andReturn(null);
        });

        Storage::fake('public');
    }

    protected function tearDown(): void
    {
        // Rate limiter keys persist across tests via cache store — clear the
        // per-user key so one test's hits don't throttle the next.
        if (isset($this->userId)) {
            RateLimiter::clear('chat-min:'.$this->userId);
        }

        parent::tearDown();
    }

    private int $userId = 0;

    /** 1x1 pixel JPEG (valid base64 payload; service decodes any base64). */
    private function tinyJpegDataUrl(): string
    {
        return 'data:image/jpeg;base64,'.base64_encode(
            "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xD9"
        );
    }

    private function authUser(): User
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');
        $this->userId = $user->id;

        return $user;
    }

    public function test_store_message_returns_201_with_messages_and_session(): void
    {
        $user = $this->authUser();
        $session = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);

        $response = $this->postJson('/api/v1/chat', [
            'content' => 'How is my training going?',
            'session_id' => $session->id,
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'user_message' => ['id', 'session_id', 'role', 'content', 'image_url', 'created_at'],
                'assistant_message' => ['id', 'session_id', 'role', 'content', 'image_url', 'created_at'],
                'session' => ['id', 'title', 'last_message_at', 'created_at'],
            ])
            ->assertJsonPath('user_message.content', 'How is my training going?')
            ->assertJsonPath('user_message.role', 'user')
            ->assertJsonPath('assistant_message.role', 'assistant')
            ->assertJsonPath('session.id', $session->id);

        // User + assistant messages persisted for this session.
        $this->assertDatabaseCount('chat_messages', 2);
        $this->assertSame(
            2,
            ChatMessage::where('chat_session_id', $session->id)->count()
        );
        $this->assertNotNull($session->refresh()->last_message_at);
    }

    public function test_store_without_session_id_auto_creates_session_when_none_exists(): void
    {
        $user = $this->authUser();

        $response = $this->postJson('/api/v1/chat', [
            'content' => 'First message, no session id',
        ]);

        $response->assertStatus(201);

        // Exactly one session was created and owns both messages.
        $this->assertDatabaseCount('chat_sessions', 1);
        $this->assertDatabaseCount('chat_messages', 2);

        $session = ChatSession::where('user_id', $user->id)->first();
        $this->assertSame($session->id, $response->json('session.id'));
        $this->assertSame(
            2,
            ChatMessage::where('chat_session_id', $session->id)->count()
        );
    }

    public function test_store_without_session_id_reuses_latest_session(): void
    {
        $user = $this->authUser();
        $session = ChatSession::create(['user_id' => $user->id, 'title' => 'New chat']);
        $session->forceFill(['last_message_at' => now()])->save();

        $this->postJson('/api/v1/chat', ['content' => 'continue here']);

        // Reused, not duplicated.
        $this->assertDatabaseCount('chat_sessions', 1);
        $this->assertSame(
            2, // 0 prior + user + assistant
            ChatMessage::where('chat_session_id', $session->id)->count()
        );
    }

    public function test_store_with_empty_content_and_no_image_returns_422(): void
    {
        $user = $this->authUser();

        $response = $this->postJson('/api/v1/chat', [
            'content' => '',
        ]);

        // Validation: content required_without:image, min:1.
        $response->assertStatus(422);
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_store_with_content_over_1000_chars_returns_422(): void
    {
        $this->authUser();

        $response = $this->postJson('/api/v1/chat', [
            'content' => str_repeat('a', 1001),
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('content');
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_store_with_image_data_url_persists_image(): void
    {
        $user = $this->authUser();

        $response = $this->postJson('/api/v1/chat', [
            'image' => $this->tinyJpegDataUrl(),
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('assistant_message.role', 'assistant');

        // user_message carries a public image_url (accessor over image_path)
        $userMessage = ChatMessage::where('role', 'user')->first();
        $this->assertNotNull($userMessage->image_path);
        $this->assertNotNull($userMessage->image_url);
        $this->assertStringContainsString('storage/chat-images/', $userMessage->image_url);

        // Stored on the public disk.
        Storage::disk('public')->assertExists($userMessage->image_path);
    }

    public function test_store_with_invalid_image_url_creates_message_without_image(): void
    {
        $this->authUser();

        $response = $this->postJson('/api/v1/chat', [
            'image' => 'data:image/jpeg;base64,!!!not-base64!!!',
        ]);

        // Regex matches data:image/jpeg;base64, prefix, but base64_decode with
        // strict mode fails -> storeImage returns null, message still stored.
        $response->assertStatus(201);

        $userMessage = ChatMessage::where('role', 'user')->first();
        $this->assertNull($userMessage->image_path);
        $this->assertNull($userMessage->image_url);
    }

    public function test_rate_limit_blocks_after_20_messages_per_minute(): void
    {
        $user = $this->authUser();
        RateLimiter::clear('chat-min:'.$user->id);

        $statuses = [];
        for ($i = 1; $i <= 21; $i++) {
            $response = $this->postJson('/api/v1/chat', [
                'content' => "message {$i}",
            ]);
            $statuses[] = $response->status();
        }

        // First 20 pass, 21st throttled.
        $this->assertSame(201, $statuses[19]);
        $this->assertSame(429, $statuses[20]);

        $this->assertSame(20, count(array_filter($statuses, fn ($s) => $s === 201)));
        $this->assertSame(1, count(array_filter($statuses, fn ($s) => $s === 429)));

        RateLimiter::clear('chat-min:'.$user->id);
    }
}
