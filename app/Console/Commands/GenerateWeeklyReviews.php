<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\WorkoutSession;
use App\Services\Reports\WeeklyReviewService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Generates weekly training review reports for active members.
 *
 * Runs automatically (e.g. every Sunday evening / Monday 00:05) so when members
 * open the application at the start of the week, their weekly intelligence
 * review is already computed and ready to read.
 *
 * Idempotent: WeeklyReviewService guards on (user_id, week_start), so running
 * this command multiple times or replaying failed batches never creates
 * duplicate reports.
 */
class GenerateWeeklyReviews extends Command
{
    protected $signature = 'striv:generate-weekly-reviews
                            {--weeks-ago=1 : Number of weeks back to review (default 1 = last finished week)}
                            {--user= : Optional specific user ID to generate for}';

    protected $description = 'Generate weekly training recap intelligence reports for members with completed workouts.';

    public function handle(WeeklyReviewService $reviewService): int
    {
        $weeksAgo = max(0, (int) $this->option('weeks-ago'));
        $targetMonday = Carbon::now()->subWeeks($weeksAgo)->startOfWeek();
        $targetSunday = $targetMonday->copy()->endOfWeek();

        $this->info(sprintf(
            'Starting weekly reviews generation for ISO week %s (%s to %s)...',
            $targetMonday->format('W'),
            $targetMonday->format('Y-m-d'),
            $targetSunday->format('Y-m-d')
        ));

        $userId = $this->option('user');

        if ($userId) {
            $users = User::where('id', $userId)->get();
        } else {
            // Target members who actually logged completed workouts in the target week
            $activeUserIds = WorkoutSession::whereNotNull('finished_at')
                ->whereBetween('finished_at', [$targetMonday->copy()->startOfDay(), $targetSunday->copy()->endOfDay()])
                ->distinct()
                ->pluck('user_id');

            $users = User::whereIn('id', $activeUserIds)->get();
        }

        if ($users->isEmpty()) {
            $this->comment('No active users found with finished sessions for this week window.');
            return self::SUCCESS;
        }

        $generated = 0;
        $failed = 0;

        foreach ($users as $user) {
            try {
                $report = $reviewService->generate($user, $targetMonday);
                $this->line(sprintf('  [OK] User #%d (%s) - Report #%d', $user->id, $user->name, $report->id));
                $generated++;
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Weekly review generation failed for user '.$user->id, [
                    'error' => $e->getMessage(),
                    'week' => $targetMonday->toDateString(),
                ]);
                $this->error(sprintf('  [FAIL] User #%d (%s): %s', $user->id, $user->name, $e->getMessage()));
            }
        }

        $this->info(sprintf('Finished: %d generated/verified, %d failed.', $generated, $failed));

        return $failed > 0 && $generated === 0 ? self::FAILURE : self::SUCCESS;
    }
}
