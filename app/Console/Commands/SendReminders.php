<?php

namespace App\Console\Commands;

use App\Services\Reminders\ReminderService;
use Illuminate\Console\Command;

/**
 * Runs the consistency-reminder sweeps.
 *
 * One command with a `--only` switch rather than five commands, because they
 * share the same safety properties (idempotent per day, opt-out aware) and are
 * operated together. Scheduling is done in routes/console.php.
 *
 * Every sweep is safe to run repeatedly: the send log enforces one reminder per
 * member per kind per channel per day, so a retry after a failure cannot spam.
 */
class SendReminders extends Command
{
    protected $signature = 'reminders:send
                            {--only= : Run a single sweep (morning|streak|praise|weekly|missed)}
                            {--dry-run : Report what would be sent without sending}';

    protected $description = 'Send consistency reminders to members (idempotent per day).';

    public function handle(ReminderService $reminders): int
    {
        $only = $this->option('only');
        $dry = (bool) $this->option('dry-run');

        if ($dry) {
            $this->warn('Dry run — nothing will be sent.');
        }

        $sweeps = [
            'morning' => ['Morning of training day', fn () => $reminders->sendMorningReminders()],
            'streak' => ['Streak break warning', fn () => $reminders->sendStreakBreakWarnings()],
            'praise' => ['Post-workout praise', fn () => $reminders->sendPostWorkoutPraise()],
            'weekly' => ['Weekly recap', fn () => $reminders->sendWeeklyRecaps()],
            'missed' => ['Missed session nudge', fn () => $reminders->sendMissedSessionNudges()],
        ];

        if ($only !== null && ! array_key_exists($only, $sweeps)) {
            $this->error("Unknown sweep '{$only}'. Valid: ".implode(', ', array_keys($sweeps)));

            return self::FAILURE;
        }

        if ($dry) {
            // Report eligibility without writing anything, so an operator can
            // see who would be contacted before turning the scheduler on.
            $this->table(['Sweep', 'Status'], array_map(
                fn ($key) => [$key, 'would run'],
                array_keys($only !== null ? [$only => true] : $sweeps),
            ));

            return self::SUCCESS;
        }

        $totalSent = 0;

        foreach ($sweeps as $key => [$label, $run]) {
            if ($only !== null && $only !== $key) {
                continue;
            }

            $stats = $run();
            $totalSent += $stats['sent'];

            $this->line(sprintf(
                '  %-28s sent=%-4d skipped=%-4d',
                $label,
                $stats['sent'],
                $stats['skipped'],
            ));
        }

        $this->info("Done. {$totalSent} reminder(s) delivered.");

        return self::SUCCESS;
    }
}
