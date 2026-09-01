<?php

namespace App\Http\Controllers;

use App\Services\Analytics\AnalyticsService;
use App\Models\Exercise;
use Illuminate\Http\Request;
use Carbon\Carbon;

class AnalyticsController extends Controller
{
    public function __construct(private AnalyticsService $analytics)
    {
    }

    public function dashboard(Request $request)
    {
        $user = $request->user();
        return response()->json($this->analytics->dashboardOverview($user));
    }

    public function progress(Request $request)
    {
        $user = $request->user();
        $days = (int) $request->input('days', 90);
        $allowed = [7, 30, 90, 180, 365, 9999];
        if (!in_array($days, $allowed)) {
            $days = 90;
        }
        $from = Carbon::now()->subDays($days)->startOfDay();
        $to = Carbon::now();

        $volumeByDay = $this->analytics->volumeByDay($user, $from, $to);
        $volumeByWeek = $this->analytics->volumeByWeek($user, 12);
        $frequencyWeekly = $this->analytics->frequencyWeekly($user, 12);

        $bigLifts = AnalyticsService::BIG_LIFTS;
        $e1rmTrend = [];
        foreach ($bigLifts as $slug) {
            $exercise = Exercise::where('slug', $slug)->first();
            if ($exercise) {
                $points = $this->analytics->strength->bestSetPerSession($user, $exercise, $from, $to);
                $e1rmTrend[] = [
                    'slug' => $slug,
                    'name' => $exercise->name,
                    'points' => $points,
                ];
            }
        }

        $consistency = $this->analytics->consistencyScore($user, 4);

        return response()->json([
            'volume_by_day' => $volumeByDay,
            'volume_by_week' => $volumeByWeek,
            'frequency_weekly' => $frequencyWeekly,
            'e1rm_trend' => $e1rmTrend,
            'consistency' => $consistency,
        ]);
    }

    public function exerciseAnalytics(Request $request, string $slug)
    {
        $user = $request->user();
        $exercise = Exercise::where('slug', $slug)->firstOrFail();
        $summary = $this->analytics->exerciseSummary($user, $exercise);
        $points = $this->analytics->strength->bestSetPerSession($user, $exercise);

        return response()->json([
            'exercise' => $exercise->load('muscleGroups'),
            'summary' => $summary,
            'points' => $points,
        ]);
    }
}