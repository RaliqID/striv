<?php

namespace App\Console\Commands;

use App\Models\TrainerAssignment;
use App\Models\User;
use App\Models\WorkoutSession;
use App\Models\XpEvent;
use App\Services\Progression\XpService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Penalises members who skipped a session their coach scheduled.
 *
 * The XP system rewards showing up, but a reward-only system drifts: a member
 * who trains twice a week and one who trains never can end up looking similar
 * once the easy early levels are gone. This applies the other half of the
 * ledger — a small, capped-in-effect penalty for a scheduled day that passed
 * without a finished session.
 *
 * Deliberately conservative:
 *
 *   - Only the last seven days are examined, so switching this on does not
 *     retroactively punish a member for an old gap they cannot act on.
 *   - Only members with an ACTIVE coach are judged, because without a schedule
 *     there is no agreed session to have missed.
 *   - Each (member, date) pair carries its own dedupe key, which is what makes
 *     the sweep idempotent: running it twice penalises once.
 */
class ApplyMissedSessionPenalties extends Command
{
    protected $signature = 'striv:missed-session-penalties
                            {--days=7 : How many past days to examine}';

    protected $description = 'Apply XP penalties for scheduled sessions that were not completed (idempotent).';

    public function handle(XpService $xp): int
    {
        $days = max(1, (int) $this->option('days'));

        $members = User::where('role', User::ROLE_USER)
            ->whereHas('trainerAssignments', function ($q) {
                $q->where('status', TrainerAssignment::STATUS_ACTIVE);
            })
            ->with(['trainerAssignments' => function ($q) {
                $q->where('status', TrainerAssignment::STATUS_ACTIVE)->with('schedules');
            }])
            ->get();

        $penalised = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($members as $member) {
            // One bad row must not abort the whole sweep — the next member's
            // penalty is unrelated to this one's failure.
            try {
                $assignment = $member->trainerAssignments->first();

                if ($assignment === null || $assignment->schedules->isEmpty()) {
                    $skipped++;

                    continue;
                }

                // ISO weekday numbers (1=Monday…7=Sunday), matching how
                // trainer_schedules.day_of_week is stored.
                $scheduledDays = $assignment->schedules
                    ->pluck('day_of_week')
                    ->map(fn ($d) => (int) $d)
                    ->all();

                // Yesterday backwards: today is still in progress and a member
                // may yet train, so penalising it would be both wrong and cruel.
                for ($i = 1; $i <= $days; $i++) {
                    $date = now()->subDays($i);

                    if (! in_array((int) $date->isoWeekday(), $scheduledDays, true)) {
                        continue;
                    }

                    if ($this->trainedOn($member, $date)) {
                        continue;
                    }

                    $granted = $xp->award(
                        $member,
                        XpEvent::SOURCE_SESSION_MISSED,
                        label: 'Missed scheduled session',
                        dedupeKey: 'missed:'.$member->id.':'.$date->toDateString(),
                        subjectType: TrainerAssignment::class,
                        subjectId: $assignment->id,
                    );

                    // award() returns 0 when the key already exists, which is
                    // the normal outcome on a second run rather than an error.
                    if ($granted !== 0) {
                        $penalised++;
                    } else {
                        $skipped++;
                    }
                }
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Missed-session penalty failed for user '.$member->id, [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->info(sprintf(
            'Missed-session penalties: %d applied, %d already recorded, %d member(s) failed.',
            $penalised,
            $skipped,
            $failed,
        ));

        if ($failed > 0) {
            $this->warn('Some members could not be processed; see the log for details.');
        }

        return self::SUCCESS;
    }

    /**
     * Whether the member finished (or started) a session on the given day.
     *
     * Checks `finished_at` first — the canonical marker — but also accepts a
     * session whose `started_at` falls on the day, so a workout begun late and
     * finished after midnight is not counted as a miss. `completed_at` is not a
     * column on workout_sessions and must not be used.
     */
    private function trainedOn(User $member, Carbon $date): bool
    {
        $day = $date->toDateString();

        return WorkoutSession::where('user_id', $member->id)
            ->where(function ($q) use ($day) {
                $q->whereDate('finished_at', $day)
                    ->orWhereDate('started_at', $day);
            })
            ->exists();
    }
}
