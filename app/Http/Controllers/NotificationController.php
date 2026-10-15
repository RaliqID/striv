<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use Illuminate\Http\Request;

/**
 * The in-app notification inbox.
 *
 * Shared by members, trainers and admins — everyone gets notifications, so this
 * is not behind the panel middleware. A user can only ever see and mutate their
 * own rows; there is no admin view of someone else's inbox.
 */
class NotificationController extends Controller
{
    /** Newest first, with the unread count the panel badge needs. */
    public function index(Request $request)
    {
        $limit = min(100, max(1, (int) $request->query('limit', 30)));

        $notifications = $request->user()->appNotifications()
            ->limit($limit)
            ->get()
            ->map(fn (AppNotification $n) => [
                'id' => $n->id,
                'type' => $n->type,
                'title' => $n->title,
                'body' => $n->body,
                'action_url' => $n->action_url,
                'read' => ! $n->isUnread(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    /** Cheap endpoint for polling the badge without fetching the list. */
    public function unreadCount(Request $request)
    {
        return response()->json([
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    /** Mark one notification read, scoped to the caller. */
    public function markRead(Request $request, int $id)
    {
        $notification = AppNotification::where('user_id', $request->user()->id)
            ->findOrFail($id);

        $notification->markRead();

        return response()->json([
            'unread_count' => $request->user()->unreadNotifications()->count(),
        ]);
    }

    /** Mark everything read — the "clear" action on the inbox. */
    public function markAllRead(Request $request)
    {
        $updated = $request->user()->unreadNotifications()
            ->update(['read_at' => now()]);

        return response()->json([
            'updated' => $updated,
            'unread_count' => 0,
        ]);
    }
}
