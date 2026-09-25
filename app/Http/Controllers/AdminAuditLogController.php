<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use Illuminate\Http\Request;

/**
 * Read-only history of privileged actions.
 */
class AdminAuditLogController extends Controller
{
    public function index(Request $request)
    {
        $query = AdminAuditLog::query();

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('actor_name', 'like', '%'.$search.'%')
                    ->orWhere('target_label', 'like', '%'.$search.'%')
                    ->orWhere('action', 'like', '%'.$search.'%');
            });
        }

        $action = trim((string) $request->query('action', ''));
        if ($action !== '' && $action !== 'all') {
            $query->where('action', $action);
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 25)));
        $logs = $query->latest('id')->paginate($perPage);

        return response()->json([
            'data' => collect($logs->items())->map(fn (AdminAuditLog $log) => [
                'id' => $log->id,
                'actor_id' => $log->actor_id,
                'actor_name' => $log->actor_name,
                'target_user_id' => $log->target_user_id,
                'target_label' => $log->target_label,
                'action' => $log->action,
                'metadata' => $log->metadata,
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->values(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ],
            // Populated from the data so the filter never offers an option
            // that matches nothing.
            'actions' => AdminAuditLog::query()
                ->select('action')
                ->distinct()
                ->orderBy('action')
                ->pluck('action')
                ->values(),
        ]);
    }
}
