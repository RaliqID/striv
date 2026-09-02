<?php

namespace App\Http\Controllers;

use App\Services\AI\ChatService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

class ChatController extends Controller
{
    private const RATE_LIMIT_PER_MINUTE = 5;

    public function __construct(private readonly ChatService $chat)
    {
    }

    /**
     * Conversation history (oldest → newest).
     */
    public function index(Request $request)
    {
        $messages = $this->chat->history($request->user(), 50);

        return response()->json([
            'messages' => $messages,
            'remaining_today' => $this->remainingToday($request),
        ]);
    }

    /**
     * Send a message, get the coach reply.
     */
    public function store(Request $request)
    {
        Log::debug('Chat store request', [
            'all' => $request->all(),
            'json' => $request->json()->all(),
            'content' => $request->getContent(),
        ]);

        $validated = $request->validate([
            'content' => 'required|string|min:1|max:' . ChatService::MAX_MESSAGE_CHARS,
        ]);

        $user = $request->user();

        // Rate limits: per-minute throttle + daily quota
        $throttleKey = 'chat-min:' . $user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::RATE_LIMIT_PER_MINUTE)) {
            return response()->json([
                'message' => 'You are sending messages too quickly. Please wait a moment.',
            ], 429);
        }
        RateLimiter::hit($throttleKey, 60);

        if ($this->chat->dailyCount($user) >= ChatService::DAILY_LIMIT) {
            return response()->json([
                'message' => 'You have reached your daily chat limit (' . ChatService::DAILY_LIMIT . ' messages). Come back tomorrow.',
            ], 429);
        }

        $result = $this->chat->send($user, $validated['content']);

        return response()->json([
            'user_message' => $this->formatMessage($result['user_message']),
            'assistant_message' => $this->formatMessage($result['assistant_message']),
            'remaining_today' => $this->remainingToday($request),
        ], 201);
    }

    /**
     * Clear the conversation.
     */
    public function destroy(Request $request)
    {
        $this->chat->clear($request->user());

        return response()->json(['message' => 'Conversation cleared.']);
    }

    private function remainingToday(Request $request): int
    {
        return max(0, ChatService::DAILY_LIMIT - $this->chat->dailyCount($request->user()));
    }

    private function formatMessage($m): array
    {
        return [
            'id' => $m->id,
            'role' => $m->role,
            'content' => $m->content,
            'created_at' => $m->created_at->toIso8601String(),
        ];
    }
}
