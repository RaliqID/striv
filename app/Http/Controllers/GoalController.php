<?php

namespace App\Http\Controllers;

use App\Models\Goal;
use App\Models\PersonalRecord;
use App\Models\WorkoutSession;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GoalController extends Controller
{
    public function index(Request $request)
    {
        $goals = $request->user()->goals()
            ->with('exercise')
            ->when($request->status, function ($query, $status) {
                return $query->where('status', $status);
            })
            ->paginate(20);

        return response()->json($goals);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'exercise_id' => 'required|exists:exercises,id',
            'target_type' => ['required', Rule::in(['weight', 'reps', 'one_rm', 'workouts'])],
            'target_value' => 'required|numeric|gt:0',
            'target_reps' => 'nullable|integer|min:1|max:500',
            'deadline' => 'nullable|date',
            'status' => ['sometimes', Rule::in(['active', 'completed', 'abandoned'])],
        ]);

        // Set default status if not provided
        $validated['status'] = $validated['status'] ?? 'active';

        $goal = $request->user()->goals()->create($validated);

        return response()->json($goal->load('exercise'), 201);
    }

    public function show(Goal $goal)
    {
        $this->authorize('view', $goal);
        $goal->load('exercise', 'progress');
        return response()->json($goal);
    }

    public function update(Request $request, Goal $goal)
    {
        $this->authorize('update', $goal);

        $validated = $request->validate([
            'target_type' => ['sometimes', Rule::in(['weight', 'reps', 'one_rm', 'workouts'])],
            'target_value' => 'sometimes|numeric|gt:0',
            'target_reps' => 'sometimes|nullable|integer|min:1|max:500',
            'deadline' => 'sometimes|nullable|date',
            'status' => ['sometimes', Rule::in(['active', 'completed', 'abandoned'])],
        ]);

        // Replace null deadline explicitly (validation sometimes + nullable → null clears field)
        $goal->update($validated);

        return response()->json($goal->load('exercise'));
    }

    public function destroy(Goal $goal)
    {
        $this->authorize('delete', $goal);
        $goal->delete();
        return response()->json(null, 204);
    }

    public function progress(Goal $goal)
    {
        $this->authorize('view', $goal);

        $currentValue = 0;
        $user = $goal->user;

        switch ($goal->target_type) {
            case 'weight':
            case 'reps':
            case 'one_rm':
                // Get the latest personal record for this exercise and user
                $pr = PersonalRecord::where('user_id', $user->id)
                    ->where('exercise_id', $goal->exercise_id)
                    ->where('pr_type', $goal->target_type)
                    ->orderBy('achieved_at', 'desc')
                    ->first();
                $currentValue = $pr ? (float) $pr->value : 0;
                break;
            case 'workouts':
                // Count total FINISHED workout sessions for the user
                $currentValue = WorkoutSession::where('user_id', $user->id)
                    ->whereNotNull('finished_at')
                    ->count();
                break;
        }

        $progressPercentage = $goal->target_value > 0 
            ? min(100, ($currentValue / $goal->target_value) * 100)
            : 0;

        $goal->load('exercise');

        return response()->json([
            'goal' => $goal,
            'current_value' => $currentValue,
            'progress_percentage' => round($progressPercentage, 2),
        ]);
    }
}