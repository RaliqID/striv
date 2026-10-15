<?php

namespace App\Http\Controllers;

use App\Models\WorkoutSession;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Models\Exercise;
use App\Models\XpEvent;
use App\Jobs\GenerateInsight;
use App\Services\Progression\AchievementService;
use App\Services\Progression\XpService;
use App\Services\Records\PersonalRecordService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WorkoutSessionController extends Controller
{
    public function index(Request $request)
    {
        $sessions = $request->user()
            ->workoutSessions()
            ->withCount('workoutExercises')
            ->orderBy('started_at', 'desc')
            ->paginate(20);

        return response()->json($sessions);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'started_at' => 'required|date',
            'notes' => 'nullable|string',
        ]);

        $session = $request->user()->workoutSessions()->create([
            'started_at' => $validated['started_at'],
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json($session, 201);
    }

    public function show(WorkoutSession $workoutSession)
    {
        $this->authorize('view', $workoutSession);

        $workoutSession->load(['workoutExercises.exercise', 'workoutExercises.sets']);

        return response()->json($workoutSession);
    }

    public function finish(Request $request, WorkoutSession $workoutSession)
    {
        $this->authorize('update', $workoutSession);

        $validated = $request->validate([
            'notes' => 'nullable|string',
        ]);

        $workoutSession->update([
            'finished_at' => now(),
            'duration_minutes' => $workoutSession->started_at->diffInMinutes(now()),
            'notes' => $validated['notes'] ?? $workoutSession->notes,
        ]);

        // PR detection – must not fail the finish response
        $prsDetected = 0;
        $prs = [];
        try {
            $service = app(PersonalRecordService::class);
            $prs = $service->detectForSession($workoutSession);
            $prsDetected = count($prs);
        } catch (\Throwable $e) {
            Log::warning('PR detection failed for session '.$workoutSession->id, ['error' => $e->getMessage()]);
        }

        // AI insight generation – fire-and-forget; never block finish.
        try {
            GenerateInsight::dispatch($workoutSession->user_id);
        } catch (\Throwable $e) {
            Log::warning('Insight dispatch failed for session '.$workoutSession->id, ['error' => $e->getMessage()]);
        }

        $workoutSession->load(['workoutExercises.exercise', 'workoutExercises.sets']);

        $sets = $workoutSession->workoutExercises->flatMap->sets;

        $summary = [
            'exercises' => $workoutSession->workoutExercises->count(),
            'sets' => $sets->count(),
            'volume_kg' => (float) $sets->whereNotNull('weight_kg')->whereNotNull('reps')
                ->sum(fn ($set) => $set->weight_kg * $set->reps),
            'prs_detected' => $prsDetected,
        ];

        /*
         * The reward payload.
         *
         * Built here rather than fetched by a second request so the screen has
         * everything the moment the session ends — a reward that needs a
         * follow-up round trip arrives after the moment has passed.
         *
         * Wrapped because the AI sentence inside it can fail; the computed
         * blocks must still reach the client.
         */
        $reward = null;
        try {
            $reward = app(\App\Services\Training\WorkoutRewardService::class)
                ->forSession($workoutSession);
        } catch (\Throwable $e) {
            Log::warning('Reward build failed for session '.$workoutSession->id, [
                'error' => $e->getMessage(),
            ]);
        }

        /*
         * Progression.
         *
         * Declared before the try so the response shape is identical whether the
         * whole block succeeds, partially succeeds, or throws — a reward screen
         * with missing keys is worse than one showing zero.
         *
         * `$previousLevel` is read BEFORE any award so `leveled_up` describes
         * this session rather than the balance already reached.
         */
        $xpEarned = 0;
        $unlocked = [];
        $progress = null;
        $previousLevel = 1;

        try {
            $xp = app(XpService::class);

            $previousLevel = $xp->statFor($workoutSession->user)->level;

            // Completing a session is the core act the system is meant to
            // encourage, so it is the base award every other bonus stacks on.
            $xpEarned += $xp->award(
                $workoutSession->user,
                XpEvent::SOURCE_WORKOUT_COMPLETED,
                label: null,
                dedupeKey: 'session:'.$workoutSession->id.':completed',
                subjectType: WorkoutSession::class,
                subjectId: $workoutSession->id,
            );

            // A proven set is the one signal that is expensive to fake, so it
            // pays a token amount on top of the session that already covers the
            // same work — the reward is for the EVIDENCE, not the reps.
            foreach ($sets as $set) {
                if (! $set->isProven()) {
                    continue;
                }

                $xpEarned += $xp->award(
                    $workoutSession->user,
                    XpEvent::SOURCE_PROVEN_SET,
                    label: null,
                    dedupeKey: 'session:'.$workoutSession->id.':set:'.$set->id.':proven',
                    subjectType: WorkoutSet::class,
                    subjectId: $set->id,
                );
            }

            // A personal record is rare and cannot be manufactured by showing
            // up, which is why it is the single largest award in the table.
            foreach ($prs as $pr) {
                /*
                 * Keyed on the record's IDENTITY (exercise + type), never on
                 * $pr->id.
                 *
                 * PersonalRecordService::detectForSession() deletes and
                 * re-inserts this session's PR rows on every call, so the row ID
                 * changes each time. A key built from it would be new on every
                 * replay — finishing the same session twice would mint the PR
                 * award again, which is precisely the farming this key exists to
                 * prevent. Exercise + type is stable across replays.
                 */
                $xpEarned += $xp->award(
                    $workoutSession->user,
                    XpEvent::SOURCE_PR_SET,
                    label: $pr->exercise?->name,
                    dedupeKey: 'session:'.$workoutSession->id.':pr:'.$pr->exercise_id.':'.$pr->pr_type,
                    subjectType: \App\Models\PersonalRecord::class,
                    subjectId: $pr->id,
                );
            }

            // Training on a day the trainer scheduled is adherence to the PLAN
            // rather than just effort, which the session award alone cannot see.
            if ($this->completedOnScheduledDay($workoutSession->user)) {
                $xpEarned += $xp->award(
                    $workoutSession->user,
                    XpEvent::SOURCE_SCHEDULE_KEPT,
                    label: null,
                    dedupeKey: 'session:'.$workoutSession->id.':schedule_kept',
                    subjectType: WorkoutSession::class,
                    subjectId: $workoutSession->id,
                );
            }

            // A second consecutive training week is where consistency starts to
            // look like a habit, so it is only paid once the run reaches two.
            if ($this->currentWeekStreak($workoutSession->user) >= 2) {
                $xpEarned += $xp->award(
                    $workoutSession->user,
                    XpEvent::SOURCE_STREAK_WEEK,
                    label: null,
                    dedupeKey: $this->streakWeekKey(),
                    subjectType: null,
                    subjectId: null,
                );
            }

            // Evaluated AFTER the awards above so a badge that the session just
            // qualified for unlocks now rather than on the next visit. Badge XP
            // is paid by the service itself and is deliberately excluded from
            // $xpEarned — it is already inside $progress.
            //
            // Given its own try/catch rather than sharing the one below. Badge
            // evaluation is independent of the awards: if one award threw, the
            // shared block would skip this silently and the member would lose a
            // badge they had earned, with nothing but a log line to show for it.
            // Isolating it means a failure here is reported as a failure HERE.
            try {
                $unlocked = app(AchievementService::class)->evaluate($workoutSession->user);
            } catch (\Throwable $e) {
                Log::warning('Achievement evaluation failed for session '.$workoutSession->id, [
                    'error' => $e->getMessage(),
                ]);
            }

            // Certificates are checked here too, not only on the certificate
            // page. A milestone completed by THIS session should be awarded at
            // the moment of finishing, so the reward screen can hand over the
            // certificate along with the badges rather than the member
            // discovering it on a later visit.
            //
            // Separate try/catch for the same reason as the badges: a failure
            // here must not silently cancel the certificate check, and must not
            // take down the awards that already succeeded above.
            try {
                $certificates = app(\App\Services\Progression\CertificateService::class)
                    ->evaluate($workoutSession->user);
            } catch (\Throwable $e) {
                Log::warning('Certificate evaluation failed for session '.$workoutSession->id, [
                    'error' => $e->getMessage(),
                ]);
            }

            $progress = $xp->progressFor($workoutSession->user);
        } catch (\Throwable $e) {
            // Progression is a reward layer on top of a real workout. Losing it
            // must never turn a member's finished session into an error.
            Log::warning('Progression award failed for session '.$workoutSession->id, [
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'session' => $workoutSession,
            'summary' => $summary,
            'reward' => $reward,
            'xp' => [
                'earned' => $xpEarned,
                'progress' => $progress,
                'leveled_up' => $progress !== null && $previousLevel < $progress['level'],
                'previous_level' => $previousLevel,
            ],
            'achievements_unlocked' => collect($unlocked)->map(fn ($a) => [
                'key' => $a->key,
                'name_key' => $a->name_key,
                'description_key' => $a->description_key,
                'icon' => $a->icon,
                'xp_reward' => $a->xp_reward,
            ])->all(),
            // Certificates earned by finishing THIS session. Sent as keys and a
            // serial rather than rendered text so the reward screen can show
            // them in the member's current language.
            'certificates_unlocked' => collect($certificates)->map(fn ($c) => [
                'id' => $c->id,
                'milestone' => $c->milestone,
                'serial' => $c->serial,
                'name_key' => $c->titleKey(),
                'subtitle_key' => $c->subtitleKey(),
                'trainer_name' => $c->trainer_name,
                'issued_at' => $c->issued_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    /**
     * Whether the member trained today on a day their coach scheduled.
     *
     * `day_of_week` is stored as an ISO weekday (1=Monday…7=Sunday) in
     * trainer_schedules, so the comparison uses the matching isoWeekday() rather
     * than the zero-based dayOfWeek — a mismatch here would silently pay the
     * wrong day.
     */
    private function completedOnScheduledDay(\App\Models\User $user): bool
    {
        $assignment = $user->trainerAssignments()
            ->where('status', \App\Models\TrainerAssignment::STATUS_ACTIVE)
            ->with('schedules')
            ->first();

        if ($assignment === null) {
            return false;
        }

        $today = (int) now()->isoWeekday();

        return $assignment->schedules->contains('day_of_week', $today);
    }

    /**
     * The dedupe key for this ISO week's streak bonus.
     *
     * Isolated in a method because this string is a CONTRACT with history: it
     * must yield exactly one value per ISO week, forever. Changing the format
     * would silently re-open the award, letting every member collect the streak
     * bonus a second time in the same week — so any change here needs a matching
     * data migration, not just an edit.
     *
     * `GGGG-W` is used rather than `GGGG-WWWW`. Carbon repeats the week number
     * once per `W`, so `WWWW` rendered week 40 as "4040" — unique per week, but
     * misleading and dangerous to "tidy up" later.
     *
     * NOTE: `o` is NOT a Carbon token. It is a PHP date() token, and Carbon
     * emits it literally, producing "o-40" — which would silently create a
     * second key for the same week. `GGGG` is the ISO week-numbering year in
     * Carbon, and is what this must use.
     */
    private function streakWeekKey(): string
    {
        return 'week:'.now()->isoFormat('GGGG-W').':streak';
    }

    /**
     * Consecutive weeks containing at least one finished session, counting back
     * from this week.
     *
     * Mirrors the rule in AchievementService: a week with no session yet does
     * not break the run, so a streak is not reset every Monday before the member
     * has had a chance to train.
     */
    private function currentWeekStreak(\App\Models\User $user): int
    {
        $weeks = $user->workoutSessions()
            ->whereNotNull('finished_at')
            ->orderByDesc('finished_at')
            ->pluck('finished_at')
            ->map(fn ($date) => $date->copy()->startOfWeek()->toDateString())
            ->unique()
            ->values();

        if ($weeks->isEmpty()) {
            return 0;
        }

        $thisWeek = now()->startOfWeek()->toDateString();
        $lastWeek = now()->subWeek()->startOfWeek()->toDateString();

        $first = $weeks->first();

        if ($first !== $thisWeek && $first !== $lastWeek) {
            return 0;
        }

        $streak = 0;
        $cursor = \Carbon\Carbon::parse($first);

        foreach ($weeks as $week) {
            if ($week === $cursor->toDateString()) {
                $streak++;
                $cursor->subWeek();
            } else {
                break;
            }
        }

        return $streak;
    }

    public function update(Request $request, WorkoutSession $workoutSession)
    {
        $this->authorize('update', $workoutSession);

        $validated = $request->validate([
            'notes' => 'nullable|string',
        ]);

        $workoutSession->update($validated);

        return response()->json($workoutSession);
    }

    public function destroy(WorkoutSession $workoutSession)
    {
        $this->authorize('delete', $workoutSession);

        $workoutSession->delete();

        return response()->json(null, 204);
    }
}