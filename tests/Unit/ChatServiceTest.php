<?php

namespace Tests\Unit;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Services\AI\AIInsightService;
use App\Services\AI\ChatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

use function mb_strlen;

class ChatServiceTest extends TestCase
{
    use RefreshDatabase;

    private ChatService $chat;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->chat = app(ChatService::class);
        $this->user = User::factory()->create();

        // No AI providers configured -> ChatService falls back to offlineReply().
        $this->mock(AIInsightService::class, function ($mock) {
            $mock->shouldReceive('providers')->andReturn([]);
            $mock->shouldReceive('visionProvider')->andReturn(null);
        });
    }

    public function test_create_session_sets_user_id_and_default_title(): void
    {
        $session = $this->chat->createSession($this->user);

        $this->assertInstanceOf(ChatSession::class, $session);
        $this->assertSame($this->user->id, $session->user_id);
        $this->assertSame('New chat', $session->title);
        $this->assertDatabaseHas('chat_sessions', [
            'id' => $session->id,
            'user_id' => $this->user->id,
            'title' => 'New chat',
        ]);
    }

    public function test_first_text_message_sets_session_title_truncated_to_60_chars(): void
    {
        $session = $this->chat->createSession($this->user);

        $content = str_pad('How do I improve my squat depth and overall strength?', 100, '!');
        $this->assertSame(100, mb_strlen($content));

        $this->chat->send($this->user, $session, $content);

        $session->refresh();

        $this->assertSame(mb_substr($content, 0, 60), $session->title);
        $this->assertSame(60, mb_strlen($session->title));
    }

    public function test_existing_title_is_not_overwritten_by_send(): void
    {
        $session = $this->chat->createSession($this->user);
        $session->update(['title' => 'Squat programming']);

        $this->chat->send($this->user, $session, 'another question about training');

        $this->assertSame('Squat programming', $session->refresh()->title);
    }

    public function test_sessions_returns_newest_first_by_last_message_at(): void
    {
        $older = $this->chat->createSession($this->user);
        $newer = $this->chat->createSession($this->user);

        $older->forceFill(['last_message_at' => now()->subHour()])->save();
        $newer->forceFill(['last_message_at' => now()])->save();

        $sessions = $this->chat->sessions($this->user);

        $this->assertCount(2, $sessions);
        $this->assertSame($newer->id, $sessions[0]['id']);
        $this->assertSame($older->id, $sessions[1]['id']);
    }

    public function test_find_session_only_returns_own_sessions(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $session = $this->chat->createSession($owner);

        $this->assertNotNull($this->chat->findSession($owner, $session->id));
        $this->assertNull($this->chat->findSession($other, $session->id));
    }

    public function test_latest_session_returns_most_recently_active(): void
    {
        $older = $this->chat->createSession($this->user);
        $newer = $this->chat->createSession($this->user);

        $older->forceFill(['last_message_at' => now()->subDay()])->save();
        $newer->forceFill(['last_message_at' => now()])->save();

        $this->assertSame($newer->id, $this->chat->latestSession($this->user)->id);

        // Without any last_message_at set, falls back to id desc.
        $fresh = User::factory()->create();
        $only = $this->chat->createSession($fresh);

        $this->assertSame($only->id, $this->chat->latestSession($fresh)->id);
    }

    public function test_delete_session_removes_session_and_messages(): void
    {
        $session = $this->chat->createSession($this->user);

        ChatMessage::create([
            'user_id' => $this->user->id,
            'chat_session_id' => $session->id,
            'role' => 'user',
            'content' => 'first message',
        ]);
        ChatMessage::create([
            'user_id' => $this->user->id,
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'content' => 'reply',
        ]);

        $this->assertDatabaseCount('chat_messages', 2);

        $this->chat->deleteSession($session);

        $this->assertDatabaseMissing('chat_sessions', ['id' => $session->id]);
        $this->assertDatabaseCount('chat_messages', 0);
    }

    public function test_send_persists_user_and_assistant_messages_and_updates_session(): void
    {
        $session = $this->chat->createSession($this->user);

        $result = $this->chat->send($this->user, $session, 'What is my current bench trend?');

        // Return shape
        $this->assertArrayHasKey('user_message', $result);
        $this->assertArrayHasKey('assistant_message', $result);
        $this->assertArrayHasKey('session', $result);
        $this->assertInstanceOf(ChatMessage::class, $result['user_message']);
        $this->assertInstanceOf(ChatMessage::class, $result['assistant_message']);
        $this->assertInstanceOf(ChatSession::class, $result['session']);

        // Persisted messages belong to the session
        $this->assertDatabaseHas('chat_messages', [
            'id' => $result['user_message']->id,
            'chat_session_id' => $session->id,
            'user_id' => $this->user->id,
            'role' => 'user',
            'content' => 'What is my current bench trend?',
        ]);
        $this->assertDatabaseHas('chat_messages', [
            'id' => $result['assistant_message']->id,
            'chat_session_id' => $session->id,
            'role' => 'assistant',
        ]);

        // last_message_at updated
        $this->assertNotNull($session->refresh()->last_message_at);
    }

    public function test_send_offline_reply_appears_in_assistant_content(): void
    {
        $session = $this->chat->createSession($this->user);

        $result = $this->chat->send($this->user, $session, 'How am I doing?');

        // No workouts logged -> offline fallback explains the AI is unreachable.
        $this->assertStringContainsString(
            "can't reach the AI service",
            $result['assistant_message']->content
        );
    }

    public function test_send_with_invalid_image_data_url_still_creates_message_without_image(): void
    {
        $session = $this->chat->createSession($this->user);

        $result = $this->chat->send($this->user, $session, 'what do you think?', 'not-a-data-url');

        $this->assertNull($result['user_message']->image_path);
        $this->assertNull($result['user_message']->image_url);
        $this->assertDatabaseHas('chat_messages', [
            'id' => $result['user_message']->id,
            'role' => 'user',
            'content' => 'what do you think?',
        ]);
    }

    public function test_send_truncates_message_over_max_chars(): void
    {
        $session = $this->chat->createSession($this->user);

        $tooLong = str_repeat('x', 1200);

        $result = $this->chat->send($this->user, $session, $tooLong);

        $this->assertSame(ChatService::MAX_MESSAGE_CHARS, mb_strlen($result['user_message']->content));
        $this->assertSame(1000, mb_strlen($result['user_message']->content));
    }

    public function test_session_messages_returns_formatted_list_in_order(): void
    {
        $session = $this->chat->createSession($this->user);

        $this->chat->send($this->user, $session, 'first question');
        $this->chat->send($this->user, $session, 'second question');

        $messages = $this->chat->sessionMessages($session);

        $this->assertCount(4, $messages);
        $this->assertSame('user', $messages[0]['role']);
        $this->assertSame('assistant', $messages[1]['role']);
        $this->assertSame('first question', $messages[0]['content']);
        $this->assertSame('second question', $messages[2]['content']);
        $this->assertSame($session->id, $messages[0]['session_id']);
        $this->assertNull($messages[0]['image_url']);
    }

    public function test_clear_removes_all_user_sessions(): void
    {
        $this->chat->createSession($this->user);
        $this->chat->createSession($this->user);

        $other = User::factory()->create();
        $otherSession = $this->chat->createSession($other);

        $this->chat->clear($this->user);

        $this->assertDatabaseCount('chat_sessions', 1);
        $this->assertDatabaseHas('chat_sessions', ['id' => $otherSession->id]);
    }
}
