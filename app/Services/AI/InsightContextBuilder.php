<?php

namespace App\Services\AI;

use App\Models\Exercise;
use App\Models\User;

class InsightContextBuilder
{
    /**
     * Build the structured context object sent to the LLM.
     *
     * @param array $pattern Shape from PatternDetectionService::detect()
     * @return array
     */
    public function build(User $user, array $pattern): array
    {
        $profile = $user->profile;

        $slug = $pattern['exercise_slug'] ?? null;
        $exerciseName = $slug ? Exercise::where('slug', $slug)->value('name') : null;

        $evidence = is_array($pattern['evidence'] ?? null) ? $pattern['evidence'] : [];
        $window = is_array($pattern['window'] ?? null) ? $pattern['window'] : [];

        return [
            'role' => 'interpret_training_pattern',
            'user_profile' => [
                'experience_level' => $profile?->experience_level,
                'primary_goal' => $profile?->primary_goal,
                'training_frequency' => $profile?->training_frequency !== null ? (int) $profile->training_frequency : null,
                'age' => $profile?->age !== null ? (int) $profile->age : null,
                'weight_kg' => $profile?->weight_kg !== null ? (float) $profile->weight_kg : null,
                'height_cm' => $profile?->height_cm !== null ? (float) $profile->height_cm : null,
                'target_weight_kg' => $profile?->target_weight_kg !== null ? (float) $profile->target_weight_kg : null,
                'location' => $profile?->location,
            ],
            'pattern' => [
                'type' => $pattern['type'] ?? null,
                'exercise' => $exerciseName,
                'title' => $pattern['title'] ?? null,
                'summary' => $pattern['summary'] ?? null,
                'evidence' => $evidence,
                'confidence' => isset($pattern['confidence']) ? (float) $pattern['confidence'] : null,
                'window' => $window,
            ],
            'instructions' => 'Generate a clear motivating title (max 80 chars), concise summary (max 280 chars), and one specific actionable recommendation (max 280 chars) tailored to the user\'s experience and goal. Use evidence numbers verbatim.',
        ];
    }
}
