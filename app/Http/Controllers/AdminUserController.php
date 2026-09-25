<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Services\Security\AdminGuard;
use App\Services\Security\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminUserController extends Controller
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly AdminGuard $guard,
    ) {
    }

    public function index(Request $request)
    {
        [$cutoff30, $cutoff7] = $this->cutoffs();
        $workouts = $this->workoutCounts($cutoff30);
        $chats = $this->chatCounts($cutoff30);
        $lastWorkout = $this->lastActivity('workout_sessions', $cutoff30);
        $lastChat = $this->lastActivity('chat_messages', $cutoff30);

        $query = User::query()
            ->select('users.*')
            ->selectSub($workouts, 'workouts_30d')
            ->selectSub($chats, 'chat_messages_30d')
            ->selectSub($lastWorkout, 'last_workout_at')
            ->selectSub($lastChat, 'last_chat_at');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%');
            });
        }

        match ($request->query('status', 'all')) {
            'active' => $query->where(function ($q) use ($cutoff30) {
                $q->whereIn('users.id', DB::table('workout_sessions')->where('created_at', '>=', $cutoff30)->select('user_id'))
                    ->orWhereIn('users.id', DB::table('chat_messages')->where('created_at', '>=', $cutoff30)->select('user_id'));
            }),
            'suspended' => $query->where('is_suspended', true),
            'admin' => $query->where('is_admin', true),
            'new' => $query->where('created_at', '>=', $cutoff7),
            default => null,
        };

        $sort = $request->query('sort', 'created_at');
        $direction = strtolower((string) $request->query('order', 'desc')) === 'asc' ? 'asc' : 'desc';
        if ($sort === 'workouts_30d') {
            $query->orderBy('workouts_30d', $direction);
        } elseif ($sort === 'last_active') {
            $query->orderByRaw('COALESCE(last_workout_at, last_chat_at, users.created_at) '.$direction);
        } elseif (in_array($sort, ['name', 'created_at', 'email'], true)) {
            $query->orderBy('users.'.$sort, $direction);
        } else {
            $query->orderBy('users.created_at', 'desc');
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $users = $query->paginate($perPage);

        return response()->json([
            'data' => collect($users->items())
                ->map(fn (User $user) => $this->userRow($user))
                ->values(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'last_page' => $users->lastPage(),
            ],
        ]);
    }

    public function show(User $user)
    {
        [$cutoff30] = $this->cutoffs();
        $row = $this->userRow($this->withActivityCounts($user, $cutoff30));

        $recentWorkouts = $user->workoutSessions()
            ->latest('started_at')
            ->limit(10)
            ->get();

        $recentWorkoutRows = $recentWorkouts->map(function ($workout) {
            $agg = DB::table('workout_sets as s')
                ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
                ->where('we.workout_session_id', $workout->id)
                ->selectRaw('count(*) as set_count, COALESCE(SUM(CASE WHEN s.weight_kg IS NOT NULL AND s.reps IS NOT NULL THEN s.weight_kg * s.reps ELSE 0 END), 0) as volume')
                ->first();

            return [
                'id' => (int) $workout->id,
                'started_at' => $workout->started_at?->toIso8601String(),
                'completed_at' => $workout->finished_at?->toIso8601String(),
                'status' => $workout->finished_at ? 'completed' : 'in_progress',
                'total_sets' => (int) $agg->set_count,
                'total_volume_kg' => round((float) $agg->volume, 2),
            ];
        })->values();

        $allWorkoutQuery = $user->workoutSessions();
        $totalVolume = DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.user_id', $user->id)
            ->whereNotNull('s.weight_kg')->whereNotNull('s.reps')
            ->sum(DB::raw('s.weight_kg * s.reps'));
        $totalSets = DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.user_id', $user->id)->count();

        $chatSessions = $user->chatSessions()
            ->withCount('messages')
            ->with(['messages' => fn ($q) => $q->select('id', 'chat_session_id', 'image_path')])
            ->latest('last_message_at')->limit(20)->get()
            ->map(fn (ChatSession $session) => [
                'id' => $session->id,
                'title' => $session->title,
                'last_message_at' => $session->last_message_at?->toIso8601String(),
                'messages_count' => (int) $session->messages_count,
                'has_images' => $session->messages->contains(fn (ChatMessage $message) => $message->image_path !== null),
            ])->values();

        return response()->json([
            'user' => $row,
            'profile' => $user->profile?->only([
                'age', 'location', 'weight_kg', 'height_cm', 'target_weight_kg',
                'experience_level', 'primary_goal', 'training_frequency',
            ]),
            'recent_workouts' => $recentWorkoutRows,
            'stats' => [
                'total_workouts' => $allWorkoutQuery->count(),
                'workouts_30d' => (int) ($user->workouts_30d ?? 0),
                'total_sets' => (int) $totalSets,
                'volume_all_time_kg' => round((float) $totalVolume, 2),
                'goals_count' => $user->goals()->count(),
                'chat_messages_total' => $user->chatMessages()->count(),
                'active_tokens' => $user->tokens()->count(),
            ],
            'chat_sessions' => $chatSessions,
            // Surfaced so the UI can disable destructive controls with a
            // reason rather than letting the operator click into a 422.
            'capabilities' => $this->capabilities(request()->user(), $user),
        ]);
    }

    /**
     * Edit the account fields an administrator is allowed to correct.
     */
    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => [
                'sometimes', 'required', 'string', 'email', 'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
        ]);

        $changes = [];
        foreach ($validated as $field => $value) {
            if ((string) $user->{$field} !== (string) $value) {
                $changes[$field] = ['from' => $user->{$field}, 'to' => $value];
            }
        }

        if ($changes === []) {
            return response()->json([
                'user' => $this->userRow($user->refresh()),
                'message' => 'No changes to save.',
            ]);
        }

        // Changing an email address changes how someone logs in, so existing
        // sessions are invalidated rather than left authenticated under the
        // old identity.
        $emailChanged = array_key_exists('email', $changes);
        $user->fill($validated)->save();

        if ($emailChanged) {
            $user->tokens()->delete();
        }

        $this->audit->log('user.updated', $request->user(), $user, [
            'changes' => $changes,
            'sessions_revoked' => $emailChanged,
        ], $request);

        return response()->json([
            'user' => $this->userRow($user->refresh()),
            'message' => 'Account updated.',
        ]);
    }

    public function suspend(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot suspend your own account.'], 422);
        }

        if ($this->guard->wouldRemoveLastAdmin($user)) {
            return response()->json([
                'message' => 'This is the only remaining administrator. Promote another admin first.',
            ], 422);
        }

        $user->forceFill(['is_suspended' => true])->save();

        // Suspension is meaningless if the tokens keep working.
        $revoked = $user->tokens()->delete();

        $this->audit->log('user.suspended', $request->user(), $user, [
            'tokens_revoked' => $revoked,
        ], $request);

        return response()->json(['user' => $this->userRow($user->refresh())]);
    }

    public function unsuspend(Request $request, User $user)
    {
        $user->forceFill(['is_suspended' => false])->save();

        $this->audit->log('user.unsuspended', $request->user(), $user, [], $request);

        return response()->json(['user' => $this->userRow($user->refresh())]);
    }

    /**
     * Grant or revoke administrator rights.
     */
    public function updateRole(Request $request, User $user)
    {
        $validated = $request->validate([
            'is_admin' => ['required', 'boolean'],
        ]);

        $makeAdmin = (bool) $validated['is_admin'];

        if (! $makeAdmin) {
            if ($reason = $this->guard->checkDestructive($request->user(), $user, 'remove admin rights from')) {
                return response()->json(['message' => $reason], 422);
            }
        }

        if ($user->is_admin === $makeAdmin) {
            return response()->json([
                'user' => $this->userRow($user->refresh()),
                'message' => 'Role unchanged.',
            ]);
        }

        $user->forceFill(['is_admin' => $makeAdmin])->save();

        $this->audit->log(
            $makeAdmin ? 'user.admin_granted' : 'user.admin_revoked',
            $request->user(),
            $user,
            [],
            $request,
        );

        return response()->json([
            'user' => $this->userRow($user->refresh()),
            'message' => $makeAdmin ? 'Admin rights granted.' : 'Admin rights revoked.',
        ]);
    }

    /**
     * Issue a one-time password and force the user to change it on next login.
     *
     * The password is returned exactly once, in this response, and is never
     * recoverable afterwards — the caller is expected to hand it over out of
     * band. Existing sessions are destroyed so a reset actually ends any
     * illegitimate access in progress.
     */
    public function resetPassword(Request $request, User $user)
    {
        $temporary = Str::password(12, symbols: false);

        $user->forceFill([
            'password' => Hash::make($temporary),
            'must_change_password' => true,
        ])->save();

        $revoked = $user->tokens()->delete();

        $this->audit->log('user.password_reset', $request->user(), $user, [
            'tokens_revoked' => $revoked,
        ], $request);

        return response()->json([
            'user' => $this->userRow($user->refresh()),
            'temporary_password' => $temporary,
            'message' => 'Password reset. Hand this to the user securely — it is shown only once.',
        ]);
    }

    /**
     * Sign the user out everywhere without changing their password.
     */
    public function revokeSessions(Request $request, User $user)
    {
        $revoked = $user->tokens()->delete();

        $this->audit->log('user.sessions_revoked', $request->user(), $user, [
            'tokens_revoked' => $revoked,
        ], $request);

        return response()->json([
            'revoked' => $revoked,
            'message' => $revoked > 0
                ? "Signed out {$revoked} session(s)."
                : 'This user had no active sessions.',
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        if ($reason = $this->guard->checkDestructive($request->user(), $user, 'delete')) {
            return response()->json(['message' => $reason], 422);
        }

        // Capture identity before the row disappears — the audit entry has to
        // survive the deletion, so it cannot rely on the relation.
        $label = (string) $user->email;
        $name = (string) $user->name;

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            $user->delete();
        });

        $this->audit->log('user.deleted', $request->user(), null, [
            'deleted_user_id' => $user->id,
            'deleted_email' => $label,
            'deleted_name' => $name,
        ], $request);

        return response()->json(['message' => 'Account deleted.']);
    }

    /**
     * Stream the current filter as CSV.
     *
     * Streamed rather than buffered so an export of every account does not
     * have to fit in memory, and honours the same filters as index() so what
     * you see on screen is what you get in the file.
     */
    public function export(Request $request): StreamedResponse
    {
        [$cutoff30, $cutoff7] = $this->cutoffs();

        $query = User::query()
            ->select('users.*')
            ->selectSub($this->workoutCounts($cutoff30), 'workouts_30d')
            ->selectSub($this->chatCounts($cutoff30), 'chat_messages_30d');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%');
            });
        }

        match ($request->query('status', 'all')) {
            'active' => $query->where(function ($q) use ($cutoff30) {
                $q->whereIn('users.id', DB::table('workout_sessions')->where('created_at', '>=', $cutoff30)->select('user_id'))
                    ->orWhereIn('users.id', DB::table('chat_messages')->where('created_at', '>=', $cutoff30)->select('user_id'));
            }),
            'suspended' => $query->where('is_suspended', true),
            'admin' => $query->where('is_admin', true),
            'new' => $query->where('created_at', '>=', $cutoff7),
            default => null,
        };

        $this->audit->log('users.exported', $request->user(), null, [
            'search' => $search,
            'status' => (string) $request->query('status', 'all'),
        ], $request);

        $filename = 'striv-users-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fputcsv($out, [
                'id', 'name', 'email', 'is_admin', 'is_suspended',
                'workouts_30d', 'chat_messages_30d', 'created_at',
            ]);

            $query->orderBy('users.id')->chunk(500, function ($users) use ($out) {
                foreach ($users as $user) {
                    fputcsv($out, [
                        $user->id,
                        $user->name,
                        $user->email,
                        $user->is_admin ? 'yes' : 'no',
                        $user->is_suspended ? 'yes' : 'no',
                        (int) ($user->workouts_30d ?? 0),
                        (int) ($user->chat_messages_30d ?? 0),
                        $user->created_at?->toIso8601String(),
                    ]);
                }
            });

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /**
     * Which destructive controls make sense for this target.
     *
     * @return array<string, array{allowed: bool, reason: string|null}>
     */
    private function capabilities(User $actor, User $target): array
    {
        $isSelf = $actor->is($target);
        $lastAdmin = $this->guard->isLastAdmin($target);

        $blocked = function (string $reason) {
            return ['allowed' => false, 'reason' => $reason];
        };
        $open = ['allowed' => true, 'reason' => null];

        return [
            'suspend' => $isSelf
                ? $blocked('You cannot suspend your own account.')
                : ($lastAdmin ? $blocked('Only remaining administrator.') : $open),
            'revoke_admin' => ! $target->is_admin
                ? $blocked('Not an administrator.')
                : ($isSelf
                    ? $blocked('You cannot remove your own admin rights.')
                    : ($lastAdmin ? $blocked('Only remaining administrator.') : $open)),
            'delete' => $isSelf
                ? $blocked('You cannot delete your own account.')
                : ($lastAdmin ? $blocked('Only remaining administrator.') : $open),
        ];
    }

    private function cutoffs(): array
    {
        $now = now();
        return [$now->copy()->subDays(30), $now->copy()->subDays(7)];
    }

    private function workoutCounts($cutoff30)
    {
        return DB::table('workout_sessions')->selectRaw('count(*)')->whereColumn('workout_sessions.user_id', 'users.id')->where('created_at', '>=', $cutoff30);
    }

    private function chatCounts($cutoff30)
    {
        return DB::table('chat_messages')->selectRaw('count(*)')->whereColumn('chat_messages.user_id', 'users.id')->where('created_at', '>=', $cutoff30);
    }

    private function lastActivity(string $table, $cutoff30)
    {
        return DB::table($table)->selectRaw('max(created_at)')->whereColumn($table.'.user_id', 'users.id')->where('created_at', '>=', $cutoff30);
    }

    private function withActivityCounts(User $user, $cutoff30): User
    {
        return $user->newQuery()->whereKey($user->id)
            ->select('users.*')
            ->selectSub($this->workoutCounts($cutoff30), 'workouts_30d')
            ->selectSub($this->chatCounts($cutoff30), 'chat_messages_30d')
            ->selectSub($this->lastActivity('workout_sessions', $cutoff30), 'last_workout_at')
            ->selectSub($this->lastActivity('chat_messages', $cutoff30), 'last_chat_at')
            ->with('profile')->firstOrFail();
    }

    private function userRow(User $user): array
    {
        $lastActive = collect([$user->last_workout_at ?? null, $user->last_chat_at ?? null, $user->updated_at?->toIso8601String()])
            ->filter()->sortDesc()->first();

        return [
            'id' => (int) $user->id,
            'name' => (string) $user->name,
            'email' => (string) $user->email,
            'is_admin' => (bool) $user->is_admin,
            'is_suspended' => (bool) $user->is_suspended,
            'must_change_password' => (bool) $user->must_change_password,
            'created_at' => $user->created_at?->toIso8601String(),
            'last_active_at' => $lastActive ? (is_string($lastActive) ? $lastActive : $lastActive->toIso8601String()) : null,
            'workouts_30d' => (int) ($user->workouts_30d ?? 0),
            'chat_messages_30d' => (int) ($user->chat_messages_30d ?? 0),
        ];
    }
}
