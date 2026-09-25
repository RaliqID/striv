<?php

namespace App\Http\Controllers;

use App\Models\Goal;
use App\Services\Goals\GoalProgressService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class GoalController extends Controller
{
    public function __construct(private readonly GoalProgressService $progress)
    {
    }

    /**
     * List goals with their progress already attached.
     *
     * Progress is included inline rather than exposed only via /progress so the
     * client does not need one request per goal just to draw a list. Previously
     * a goals page with 20 goals fired 21 requests.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // Settle completion BEFORE sorting. A goal that has just been met is
        // still stored as active until something reads it; sorting first would
        // then order by a stale status and bury newly-finished goals mid-list.
        $user->goals()
            ->where('status', 'active')
            ->get()
            ->each(fn (Goal $goal) => $this->progress->syncCompletion($goal));

        $goals = $user->goals()
            ->with('exercise')
            ->when($request->status, fn ($query, $status) => $query->where('status', $status))
            ->orderByRaw("CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->paginate(20);

        $goals->getCollection()->transform(fn (Goal $goal) => $this->present($goal));

        return response()->json($goals);
    }

    public function store(Request $request)
    {
        $validated = $this->validateGoal($request, creating: true);

        $user = $request->user();
        $targetType = $validated['target_type'];
        $exerciseId = $validated['exercise_id'] ?? null;

        // Freeze where the user is starting from, so later personal records
        // cannot move the baseline and flatter the progress bar. The rep
        // standard is passed through because the baseline must be measured
        // against the same standard the goal will be judged by.
        $validated['starting_value'] = $this->progress->baselineFor(
            $user,
            $targetType,
            $exerciseId,
            isset($validated['target_reps']) ? (int) $validated['target_reps'] : null,
        );

        $this->assertTargetIsAnImprovement($validated, $request);

        $validated['status'] = $validated['status'] ?? 'active';

        $goal = $user->goals()->create($validated);

        // A goal created below the current standard is immediately achieved;
        // reflect that instead of showing a stuck 100% on an "active" goal.
        $goal = $this->progress->syncCompletion($goal);

        return response()->json($this->present($goal->load('exercise')), 201);
    }

    public function show(Request $request, Goal $goal)
    {
        $this->authorize('view', $goal);
        $goal = $this->progress->syncCompletion($goal);

        return response()->json($this->present($goal->load('exercise')));
    }

    public function update(Request $request, Goal $goal)
    {
        $this->authorize('update', $goal);

        $validated = $request->validate([
            'target_value' => ['sometimes', 'numeric', 'gt:0'],
            'starting_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'target_reps' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:500'],
            'deadline' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(['active', 'completed', 'abandoned'])],
        ]);

        // target_type is deliberately not editable: changing the unit of a goal
        // invalidates its baseline and its entire history.
        $merged = array_merge($goal->only(['target_value', 'starting_value', 'target_reps']), $validated);

        // Changing the rep standard redefines what the goal measures, so the
        // frozen baseline would be measured against the wrong standard. Recompute
        // it, otherwise raising the reps could leave a baseline that no longer
        // corresponds to any real performance.
        if (array_key_exists('target_reps', $validated)
            && (int) $validated['target_reps'] !== (int) $goal->target_reps) {
            $merged['starting_value'] = $this->progress->baselineFor(
                $goal->user,
                $goal->target_type,
                $goal->exercise_id,
                $validated['target_reps'] !== null ? (int) $validated['target_reps'] : null,
            );
            $validated['starting_value'] = $merged['starting_value'];
        }

        $this->assertTargetIsAnImprovement($merged, $request, $goal);

        // Reopening a completed goal clears its completion timestamp.
        if (($validated['status'] ?? null) === 'active' && $goal->status === 'completed') {
            $validated['completed_at'] = null;
        }

        $goal->update($validated);
        $goal = $this->progress->syncCompletion($goal->refresh());

        return response()->json($this->present($goal->load('exercise')));
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
        $goal = $this->progress->syncCompletion($goal);

        return response()->json($this->present($goal->load('exercise'), includeProgressDetail: true));
    }

    /**
     * The user's current best for a proposed goal standard.
     *
     * Called while the member is filling in the goal form so the UI can show
     * "your current best is 60kg" and stop them setting a target that would be
     * instantly complete. Without this the form could only learn the baseline
     * by being rejected on submit.
     */
    public function baseline(Request $request)
    {
        $validated = $request->validate([
            'target_type' => ['required', Rule::in(Goal::MEASURABLE_TYPES)],
            'exercise_id' => ['nullable', 'integer', 'exists:exercises,id'],
            'target_reps' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $value = $this->progress->baselineFor(
            $request->user(),
            $validated['target_type'],
            $validated['exercise_id'] ?? null,
            isset($validated['target_reps']) ? (int) $validated['target_reps'] : null,
        );

        return response()->json([
            'target_type' => $validated['target_type'],
            'current_value' => round($value, 2),
        ]);
    }

    /**
     * Shared shaping so the list, show and progress endpoints cannot drift.
     */
    private function present(Goal $goal, bool $includeProgressDetail = false): array
    {
        $current = $this->progress->currentValue($goal);

        $payload = $goal->toArray();
        $payload['unit'] = $goal->unit();
        $payload['current_value'] = round($current, 2);
        $payload['progress_percentage'] = $this->progress->progressPercentage($goal, $current);
        $payload['required_delta'] = round($goal->requiredDelta(), 2);
        $payload['remaining'] = round(max(0, (float) $goal->target_value - $current), 2);

        if ($includeProgressDetail) {
            $payload['starting_value'] = (float) ($goal->starting_value ?? 0);
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function validateGoal(Request $request, bool $creating): array
    {
        $targetType = $request->input('target_type', 'weight');
        $needsExercise = in_array($targetType, Goal::EXERCISE_TYPES, true);

        return $request->validate([
            'target_type' => ['required', Rule::in(Goal::MEASURABLE_TYPES)],
            'target_value' => ['required', 'numeric', 'gt:0', 'max:100000'],

            // Required for exercise-scoped goals, forbidden otherwise — a
            // workout-count goal has no exercise and accepting one invites
            // nonsense combinations.
            'exercise_id' => [
                $needsExercise ? 'required' : 'nullable',
                'integer',
                'exists:exercises,id',
            ],
            'target_reps' => ['nullable', 'integer', 'min:1', 'max:500'],
            'deadline' => ['nullable', 'date', 'after_or_equal:today'],
            'status' => ['sometimes', Rule::in(['active', 'completed', 'abandoned'])],
        ], [
            'exercise_id.required' => 'Choose an exercise for this type of goal.',
            'deadline.after_or_equal' => 'Pick a deadline in the future.',
        ]);
    }

    /**
     * A goal must ask for improvement.
     *
     * This is the rule that was missing: without it, "squat 30kg" against an
     * existing 30kg best is instantly complete and teaches the user nothing.
     */
    private function assertTargetIsAnImprovement(array $values, Request $request, ?Goal $existing = null): void
    {
        $target = (float) ($values['target_value'] ?? 0);
        $start = (float) ($values['starting_value'] ?? 0);

        if ($target <= $start) {
            $unit = $existing?->unit() ?? match ($request->input('target_type')) {
                'weight', 'one_rm' => 'kg',
                'reps' => 'reps',
                'workouts' => 'workouts',
                default => '',
            };

            $formattedStart = rtrim(rtrim(number_format($start, 2, '.', ''), '0'), '.');

            throw ValidationException::withMessages([
                'target_value' => $start > 0
                    ? ["Your target must be above your current {$formattedStart} {$unit}. Aim higher to make this a goal."]
                    : ['Set a target above zero.'],
            ]);
        }
    }
}
