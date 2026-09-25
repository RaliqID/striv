<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
            // Display name lives on the users table, not the profile, but it is
            // edited from the same screen — so it is accepted here and split out
            // below rather than forcing the client to make two calls.
            'name' => 'sometimes|required|string|max:255',
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

        $name = $validated['name'] ?? null;
        unset($validated['name']);

        if ($name !== null && $name !== $user->name) {
            $user->forceFill(['name' => $name])->save();
        }

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

    /**
     * Export the member's own training data as CSV.
     *
     * Self-service and scoped to the authenticated user only — this is the
     * "my data" export a member is entitled to, distinct from the admin-wide
     * export. Streamed so a long training history does not have to fit in
     * memory.
     */
    public function export(Request $request): StreamedResponse
    {
        $user = $request->user();

        $sets = DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workout_sessions as ws', 'ws.id', '=', 'we.workout_session_id')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->where('ws.user_id', $user->id)
            ->orderBy('ws.started_at')
            ->select([
                'ws.started_at',
                'ws.finished_at',
                'e.name as exercise',
                's.set_number',
                's.weight_kg',
                's.reps',
                's.rpe',
            ])
            ->get();

        $filename = 'striv-data-'.now()->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($sets) {
            $out = fopen('php://output', 'w');

            fputcsv($out, ['date', 'exercise', 'set', 'weight_kg', 'reps', 'rpe']);

            foreach ($sets as $set) {
                fputcsv($out, [
                    $set->started_at,
                    $set->exercise,
                    $set->set_number,
                    $set->weight_kg,
                    $set->reps,
                    $set->rpe,
                ]);
            }

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /**
     * Permanently delete the member's own account and all of its data.
     *
     * Requires the password as confirmation: this is irreversible and reachable
     * from a settings screen, so a stray request must not be able to trigger it.
     */
    public function destroy(Request $request)
    {
        $request->validate([
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! \Illuminate\Support\Facades\Hash::check($request->input('password'), $user->password)) {
            return response()->json([
                'message' => 'That password is incorrect.',
            ], 422);
        }

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            // Related records cascade from the users table.
            $user->delete();
        });

        return response()->json(['message' => 'Your account has been deleted.']);
    }
}