<?php

namespace App\Http\Controllers;

use App\Services\AI\ChatService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class ChatController extends Controller
{
    /** Light per-minute throttle only — no daily quota. */
    private const RATE_LIMIT_PER_MINUTE = 20;

    public function __construct(private readonly ChatService $chat)
    {
    }

    /**
     * Latest session + its messages (landing view for the coach page).
     */
    public function index(Request $request)
    {
        $session = $this->chat->latestSession($request->user());

        if ($session === null) {
            return response()->json([
                'session' => null,
                'messages' => [],
            ]);
        }

        return response()->json([
            'session' => $this->chat->formatSession($session),
            'messages' => $this->chat->sessionMessages($session),
        ]);
    }

    /**
     * Send a message, get the coach reply.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'content' => 'required_without:image|string|min:1|max:' . ChatService::MAX_MESSAGE_CHARS,
            'image' => [
                'nullable',
                'string',
                'starts_with:data:image/',
                'max:' . (ChatService::MAX_IMAGE_BYTES * 2), // base64 size headroom
            ],
            'session_id' => 'nullable|integer',
        ]);

        $user = $request->user();

        // Anti-spam only: no daily quota, users can chat freely.
        $throttleKey = 'chat-min:' . $user->id;
        if (RateLimiter::tooManyAttempts($throttleKey, self::RATE_LIMIT_PER_MINUTE)) {
            return response()->json([
                'message' => 'You are sending messages too quickly. Please wait a moment.',
            ], 429);
        }
        RateLimiter::hit($throttleKey, 60);

        // Resolve target session: explicit id, else latest, else new.
        $session = null;
        if (!empty($validated['session_id'])) {
            $session = $this->chat->findSession($user, (int) $validated['session_id']);
        }
        $session ??= $this->chat->latestSession($user) ?? $this->chat->createSession($user);

        $content = (string) ($validated['content'] ?? '');
        $image = $validated['image'] ?? null;

        if ($content === '' && $image === null) {
            return response()->json(['message' => 'Message cannot be empty.'], 422);
        }

        $result = $this->chat->send($user, $session, $content, $image);

        return response()->json([
            'user_message' => $this->chat->formatMessage($result['user_message']),
            'assistant_message' => $this->chat->formatMessage($result['assistant_message']),
            'session' => $this->chat->formatSession($result['session']),
        ], 201);
    }

    /**
     * Clear every conversation (all sessions).
     */
    public function destroy(Request $request)
    {
        $this->chat->clear($request->user());

        return response()->json(['message' => 'Conversations cleared.']);
    }
}
