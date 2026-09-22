<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminUserController extends Controller
{
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
        } elseif (in_array($sort, ['name', 'created_at'], true)) {
            $query->orderBy('users.'.$sort, $direction);
        } else {
            $query->orderBy('users.created_at', 'desc');
        }

        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));
        $users = $query->paginate($perPage);

        return response()->json([
            'data' => collect($users->items())->map(fn (User $user) => $this->userRow($user))->values(),
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
            ],
            'chat_sessions' => $chatSessions,
        ]);
    }

    public function suspend(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot suspend your own account.'], 422);
        }

        $user->forceFill(['is_suspended' => true])->save();
        return response()->json(['user' => $this->userRow($user->refresh())]);
    }

    public function unsuspend(User $user)
    {
        $user->forceFill(['is_suspended' => false])->save();
        return response()->json(['user' => $this->userRow($user->refresh())]);
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
            'created_at' => $user->created_at?->toIso8601String(),
            'last_active_at' => $lastActive ? (is_string($lastActive) ? $lastActive : $lastActive->toIso8601String()) : null,
            'workouts_30d' => (int) ($user->workouts_30d ?? 0),
            'chat_messages_30d' => (int) ($user->chat_messages_30d ?? 0),
        ];
    }
}
