<?php

namespace App\Http\Controllers;

use App\Models\AiInsight;
use App\Services\AI\AIInsightService;
use App\Services\Patterns\PatternDetectionService;
use Illuminate\Http\Request;

class InsightController extends Controller
{
    public function __construct(
        private readonly PatternDetectionService $patterns,
        private readonly AIInsightService $ai,
    ) {
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $insights = AiInsight::where('user_id', $user->id)
            ->orderBy('generated_at', 'desc')
            ->orderBy('id', 'desc')
            ->paginate(20);

        $detected = $this->patterns->detect($user);

        return response()->json([
            'insights' => $insights,
            'detected_patterns' => $detected,
        ]);
    }

    public function generate(Request $request)
    {
        $user = $request->user();
        $insights = $this->ai->generateAndPersist($user);

        return response()->json([
            'created' => count($insights),
            'insights' => $insights,
        ]);
    }
}
