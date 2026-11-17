<?php

namespace App\Console\Commands;

use App\Models\WorkoutSession;
use App\Services\Records\PersonalRecordService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Sweeps and cleans up abandoned active workout sessions (> 24 hours).
 *
 * Prevents dangling sessions from permanently blocking the TodayPlanService
 * status or cluttering user workout history with unfinished entries.
 *
 * Rules:
 *   1. Zero-exercise / zero-set sessions are deleted as empty drafts.
 *   2. Sessions with logged sets are preserved by auto-closing them with
 *      estimated duration and running PR detection so user effort is not lost.
 */
class CleanupAbandonedSessions extends Command
{
    protected $signature = 'striv:cleanup-abandoned-sessions
                            {--hours=24 : Age in hours after which an unfinished session is deemed abandoned}';

    protected $description = 'Clean up or auto-close abandoned workout sessions that have been open for over 24 hours.';

    public function handle(PersonalRecordService $prService): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $threshold = Carbon::now()->subHours($hours);

        $abandoned = WorkoutSession::whereNull('finished_at')
            ->where('started_at', '<=', $threshold)
            ->with(['workoutExercises.sets'])
            ->get();

        if ($abandoned->isEmpty()) {
            $this->comment('No abandoned sessions found.');
            return self::SUCCESS;
        }

        $this->info(sprintf('Found %d abandoned session(s) started before %s.', $abandoned->count(), $threshold->toDateTimeString()));

        $deletedDrafts = 0;
        $autoClosed = 0;

        foreach ($abandoned as $session) {
            $exercises = $session->workoutExercises;
            $setsCount = $exercises->flatMap->sets->count();

            if ($exercises->isEmpty() || $setsCount === 0) {
                // Empty draft: discard completely
                $session->delete();
                $deletedDrafts++;
                $this->line(sprintf('  [DELETED EMPTY DRAFT] Session #%d (User #%d, Started: %s)', $session->id, $session->user_id, $session->started_at));
            } else {
                // Logged work exists: close gracefully so data & PRs are preserved
                $duration = min(120, max(15, (int) $session->started_at->diffInMinutes($threshold)));
                $finishedAt = $session->started_at->copy()->addMinutes($duration);

                $noteSuffix = sprintf(' [Auto-closed by system: session abandoned >%dh]', $hours);
                $newNotes = trim(($session->notes ?? '') . $noteSuffix);

                $session->update([
                    'finished_at' => $finishedAt,
                    'duration_minutes' => $duration,
                    'notes' => $newNotes,
                ]);

                // Run PR detection for the closed session so records are recognized
                try {
                    $prService->detectForSession($session);
                } catch (\Throwable $e) {
                    Log::warning('PR detection failed during auto-closing abandoned session #'.$session->id, [
                        'error' => $e->getMessage(),
                    ]);
                }

                $autoClosed++;
                $this->line(sprintf('  [AUTO-CLOSED] Session #%d (User #%d, %d sets, duration: %dm)', $session->id, $session->user_id, $setsCount, $duration));
            }
        }

        $this->info(sprintf('Finished cleanup: %d empty drafts pruned, %d sessions auto-closed.', $deletedDrafts, $autoClosed));

        return self::SUCCESS;
    }
}
