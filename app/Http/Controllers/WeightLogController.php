<?php

namespace App\Http\Controllers;

use App\Models\WeightLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WeightLogController extends Controller
{
    /**
     * Fetch the member's bodyweight history, biometric metrics, and progress toward target.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->profile;

        $logs = $user->weightLogs()
            ->orderBy('logged_at', 'asc')
            ->get();

        $heightCm = $profile?->height_cm ? (float) $profile->height_cm : null;
        $targetWeightKg = $profile?->target_weight_kg ? (float) $profile->target_weight_kg : null;

        // Current weight: latest log, or profile weight_kg
        $latestLog = $logs->last();
        $firstLog = $logs->first();

        $currentWeightKg = $latestLog
            ? (float) $latestLog->weight_kg
            : ($profile?->weight_kg ? (float) $profile->weight_kg : null);

        $startWeightKg = $firstLog
            ? (float) $firstLog->weight_kg
            : ($profile?->weight_kg ? (float) $profile->weight_kg : null);

        $changeKg = ($currentWeightKg !== null && $startWeightKg !== null)
            ? round($currentWeightKg - $startWeightKg, 2)
            : 0.0;

        // BMI calculation
        $bmi = null;
        $bmiCategory = null;
        if ($currentWeightKg !== null && $heightCm !== null && $heightCm > 50) {
            $heightM = $heightCm / 100;
            $bmi = round($currentWeightKg / ($heightM * $heightM), 1);

            $bmiCategory = match (true) {
                $bmi < 18.5 => 'underweight',
                $bmi < 25.0 => 'normal',
                $bmi < 30.0 => 'overweight',
                default => 'obese',
            };
        }

        return response()->json([
            'logs' => $logs->map(fn (WeightLog $log) => [
                'id' => $log->id,
                'date' => $log->logged_at->format('Y-m-d'),
                'weight_kg' => (float) $log->weight_kg,
                'notes' => $log->notes,
            ]),
            'current_weight_kg' => $currentWeightKg,
            'target_weight_kg' => $targetWeightKg,
            'start_weight_kg' => $startWeightKg,
            'change_kg' => $changeKg,
            'height_cm' => $heightCm,
            'bmi' => $bmi,
            'bmi_category' => $bmiCategory,
        ]);
    }

    /**
     * Log a new weight entry or update an existing entry for that date.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'weight_kg' => ['required', 'numeric', 'min:20', 'max:400'],
            'date' => ['nullable', 'date', 'before_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $loggedAt = $validated['date'] ?? now()->format('Y-m-d');
        $weight = round((float) $validated['weight_kg'], 2);

        $log = DB::transaction(function () use ($user, $loggedAt, $weight, $validated) {
            $entry = WeightLog::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'logged_at' => $loggedAt,
                ],
                [
                    'weight_kg' => $weight,
                    'notes' => $validated['notes'] ?? null,
                ]
            );

            // Keep user profile in sync if this is the newest reading or for today
            $latestEntry = $user->weightLogs()->orderBy('logged_at', 'desc')->first();
            if ($latestEntry && $latestEntry->id === $entry->id) {
                $user->profile()->updateOrCreate(
                    ['user_id' => $user->id],
                    ['weight_kg' => $weight]
                );
            }

            return $entry;
        });

        return response()->json([
            'message' => 'Bodyweight logged successfully.',
            'log' => [
                'id' => $log->id,
                'date' => $log->logged_at->format('Y-m-d'),
                'weight_kg' => (float) $log->weight_kg,
                'notes' => $log->notes,
            ],
        ], 201);
    }

    /**
     * Delete a weight log entry.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $log = $user->weightLogs()->findOrFail($id);

        $log->delete();

        // Refresh latest weight on profile
        $latest = $user->weightLogs()->orderBy('logged_at', 'desc')->first();
        if ($latest) {
            $user->profile()->updateOrCreate(
                ['user_id' => $user->id],
                ['weight_kg' => $latest->weight_kg]
            );
        }

        return response()->json([
            'message' => 'Weight log entry removed.',
        ]);
    }
}
