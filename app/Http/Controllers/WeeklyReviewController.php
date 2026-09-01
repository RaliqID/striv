<?php

namespace App\Http\Controllers;

use App\Models\AiReport;
use App\Services\Reports\WeeklyReviewService;
use Illuminate\Http\Request;
use Carbon\Carbon;

class WeeklyReviewController extends Controller
{
    public function __construct(private readonly WeeklyReviewService $reviews)
    {
    }

    /**
     * List the user's weekly reports (newest first).
     */
    public function index(Request $request)
    {
        $reports = AiReport::where('user_id', $request->user()->id)
            ->where('type', 'weekly')
            ->orderByDesc('week_start')
            ->paginate(10);

        return response()->json($reports);
    }

    /**
     * Show a single report.
     */
    public function show(Request $request, int $id)
    {
        $report = AiReport::where('user_id', $request->user()->id)
            ->where('type', 'weekly')
            ->findOrFail($id);

        return response()->json($report);
    }

    /**
     * Generate (or fetch existing) the report for a given week.
     * Defaults to last week. `?week=YYYY-MM-DD` pins to that week's Monday.
     */
    public function generate(Request $request)
    {
        $validated = $request->validate([
            'week' => 'nullable|date|before_or_equal:today',
        ]);

        $weekStart = isset($validated['week'])
            ? Carbon::parse($validated['week'])->startOfWeek()
            : null;

        $report = $this->reviews->generate($request->user(), $weekStart);

        return response()->json($report, 201);
    }
}
