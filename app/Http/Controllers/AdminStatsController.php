<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Facades\DB;

class AdminStatsController extends Controller
{
    public function index()
    {
        $now = now();
        $cutoff30 = $now->copy()->subDays(30)->startOfDay();
        $cutoff7  = $now->copy()->subDays(7)->startOfDay();

        // ---- users ----
        $totalUsers     = User::count();
        $newUsers7d     = User::where('created_at', '>=', $cutoff7)->count();
        $suspendedUsers = User::where('is_suspended', true)->count();

        // Active = has workout_session OR chat_message in last 30d.
        $activeWs = WorkoutSession::where('created_at', '>=', $cutoff30)
            ->distinct()
            ->pluck('user_id');
        $activeCm = ChatMessage::where('created_at', '>=', $cutoff30)
            ->distinct()
            ->pluck('user_id');
        $activeUsers30d = $activeWs->merge($activeCm)->unique()->count();

        // ---- workouts ----
        $totalWorkouts = WorkoutSession::count();
        $workouts30d   = WorkoutSession::where('created_at', '>=', $cutoff30)->count();

        // ---- sets ----
        $totalSets = DB::table('workout_sets')->count();

        // ---- volume 30d: sum(weight_kg * reps) across sets in sessions in 30d ----
        $volume30dKg = round((float) DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->where('ws.created_at', '>=', $cutoff30)
            ->whereNotNull('s.weight_kg')
            ->whereNotNull('s.reps')
            ->sum(DB::raw('s.weight_kg * s.reps')), 2);

        // ---- chat ----
        $chatMessages30d = ChatMessage::where('created_at', '>=', $cutoff30)->count();
        $aiImageMessages30d = ChatMessage::where('created_at', '>=', $cutoff30)
            ->whereNotNull('image_path')
            ->count();

        // ---- signups_series: last 30 days including zeros ----
        $signupsRaw = User::where('created_at', '>=', $cutoff30)
            ->selectRaw("date(created_at) as date, count(*) as count")
            ->groupBy(DB::raw('date(created_at)'))
            ->pluck('count', 'date');

        $signupsSeries = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = $now->copy()->subDays($i)->toDateString();
            $signupsSeries[] = ['date' => $date, 'count' => (int) ($signupsRaw[$date] ?? 0)];
        }

        // ---- top_exercises ----
        $topExercises = DB::table('workout_exercises as we')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->selectRaw('e.name, count(we.id) as uses')
            ->groupBy('e.id', 'e.name')
            ->orderByDesc('uses')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['name' => $row->name, 'uses' => (int) $row->uses])
            ->values()
            ->toArray();

        return response()->json([
            'total_users'            => $totalUsers,
            'new_users_7d'           => $newUsers7d,
            'active_users_30d'       => $activeUsers30d,
            'suspended_users'        => $suspendedUsers,
            'total_workouts'         => $totalWorkouts,
            'workouts_30d'           => $workouts30d,
            'total_sets'             => $totalSets,
            'volume_30d_kg'          => $volume30dKg,
            'chat_messages_30d'      => $chatMessages30d,
            'ai_image_messages_30d'  => $aiImageMessages30d,
            'signups_series'         => $signupsSeries,
            'top_exercises'          => $topExercises,
        ]);
    }
}
