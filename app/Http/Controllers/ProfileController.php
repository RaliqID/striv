<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user()->load('profile');
        return response()->json([
            'user' => $user,
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'age' => 'nullable|integer|min:13|max:100',
            'location' => 'nullable|string|max:255',
            'weight_kg' => 'nullable|numeric|min:20|max:400',
            'height_cm' => 'nullable|numeric|min:100|max:250',
            'target_weight_kg' => 'nullable|numeric|min:20|max:400',
            'experience_level' => 'nullable|string|in:beginner,intermediate,advanced',
            'primary_goal' => 'nullable|string|in:muscle,strength,endurance',
            'training_frequency' => 'nullable|integer|min:1|max:7',
            'preferences' => 'nullable|array',
            'complete_onboarding' => 'sometimes|boolean',
        ]);

        $completeOnboarding = $request->boolean('complete_onboarding');
        $data = $validated;
        unset($data['complete_onboarding']);
        if ($completeOnboarding) {
            $data['onboarding_completed_at'] = now();
        }

        $profile = $user->profile()->updateOrCreate(
            ['user_id' => $user->id],
            $data
        );

        return $this->show($request);
    }
}