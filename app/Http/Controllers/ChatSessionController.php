<?php

namespace App\Http\Controllers;

use App\Services\AI\ChatService;
use Illuminate\Http\Request;

class ChatSessionController extends Controller
{
    public function __construct(private readonly ChatService $chat)
    {
    }

    /**
     * All sessions for the authenticated user (newest first).
     */
    public function index(Request $request)
    {
        return response()->json([
            'sessions' => $this->chat->sessions($request->user()),
        ]);
    }

    /**
     * Start a new empty session.
     */
    public function store(Request $request)
    {
        $session = $this->chat->createSession($request->user());

        return response()->json([
            'session' => $this->chat->formatSession($session),
        ], 201);
    }

    /**
     * Load a session with its messages.
     */
    public function show(Request $request, int $sessionId)
    {
        $session = $this->chat->findSession($request->user(), $sessionId);

        if ($session === null) {
            return response()->json(['message' => 'Session not found.'], 404);
        }

        return response()->json([
            'session' => $this->chat->formatSession($session),
            'messages' => $this->chat->sessionMessages($session),
        ]);
    }

    /**
     * Delete a session and its messages.
     */
    public function destroy(Request $request, int $sessionId)
    {
        $session = $this->chat->findSession($request->user(), $sessionId);

        if ($session === null) {
            return response()->json(['message' => 'Session not found.'], 404);
        }

        $this->chat->deleteSession($session);

        return response()->json(['message' => 'Session deleted.']);
    }
}
