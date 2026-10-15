<?php

namespace App\Services\Reminders;

use App\Models\ReminderSend;
use App\Models\TrainerAssignment;
use App\Models\TrainingRequest;
use App\Models\User;
use App\Models\WorkoutSession;
use App\Services\Reminders\Channels\EmailChannel;
use App\Services\Reminders\Channels\InAppChannel;
use App\Services\Reminders\Channels\ReminderChannel;
use App\Services\Reminders\Channels\WhatsAppChannel;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Sends consistency reminders.
 *
 * The whole feature exists to answer one problem: a member who has a trainer
 * and a plan still stops showing up, and nobody notices until they have been
 * gone for weeks. A reminder that arrives on the right day is the cheapest
 * intervention available.
 *
 * Design rules that keep it from becoming spam:
 *
 *   - One reminder per kind per channel per day, enforced by a unique index,
 *     so re-running the command can never double-send.
 *   - Every kind has its own opt-out, and email/WhatsApp have channel switches.
 *   - Nothing is sent to a member who has no coach. Without a coach they have
 *     no programme, so "you missed leg day" would be meaningless.
 *   - Rest days are respected: a morning reminder only goes out on a day the
 *     member is actually scheduled to train.
 */
class ReminderService
{
    /** Matches the `kind` values stored in reminder_sends. */
    public const KIND_MORNING = 'morning_training';
    public const KIND_STREAK_BREAK = 'streak_break';
    public const KIND_POST_WORKOUT = 'post_workout';
    public const KIND_WEEKLY_RECAP = 'weekly_recap';
    public const KIND_MISSED_SESSION = 'missed_session';

    /** @var array<int, ReminderChannel> */
    private array $channels;

    public function __construct(
        EmailChannel $email,
        WhatsAppChannel $whatsapp,
        InAppChannel $inApp,
    ) {
        $this->channels = [$email, $whatsapp, $inApp];
    }

    /**
     * Send the "you train today" nudge.
     *
     * Only to members whose scheduled day is today. This is the reminder with
     * the highest effect on adherence, because it arrives before the decision
     * to skip has been made.
     *
     * @return array{sent: int, skipped: int}
     */
    public function sendMorningReminders(?Carbon $now = null): array
    {
        $now ??= Carbon::now();
        $isoDay = (int) $now->isoWeekday();

        $stats = ['sent' => 0, 'skipped' => 0];

        $this->membersWithCoach()
            ->filter(fn (User $u) => (bool) $u->remind_morning_of_training)
            ->each(function (User $member) use ($isoDay, $now, &$stats) {
                $assignment = $this->activeAssignment($member);

                $slot = $assignment?->schedules->firstWhere('day_of_week', $isoDay);

                if ($slot === null) {
                    $stats['skipped']++;

                    return;
                }

                // Already trained today — a nudge would be noise.
                if ($this->trainedOn($member, $now)) {
                    $stats['skipped']++;

                    return;
                }

                $payload = $this->buildMorningPayload($member, $slot, $assignment);

                $this->dispatch($member, self::KIND_MORNING, $payload, $now)['sent'];
                $stats['sent']++;
            });

        return $stats;
    }

    /**
     * Warn a member who has gone quiet.
     *
     * Fires when the member has missed their scheduled sessions for several
     * consecutive days. Deliberately measured in missed SESSIONS rather than
     * days since last workout, because a member who trains twice a week is not
     * "inactive" after two days — only a gap against their own schedule means
     * something.
     */
    public function sendStreakBreakWarnings(int $missedThreshold = 3, ?Carbon $now = null): array
    {
        $now ??= Carbon::now();
        $stats = ['sent' => 0, 'skipped' => 0];

        $this->membersWithCoach()
            ->filter(fn (User $u) => (bool) $u->remind_streak_break)
            ->each(function (User $member) use ($missedThreshold, $now, &$stats) {
                $missed = $this->missedSessionsCount($member, $now);

                if ($missed < $missedThreshold) {
                    $stats['skipped']++;

                    return;
                }

                $payload = $this->buildStreakPayload($member, $missed);
                $this->dispatch($member, self::KIND_STREAK_BREAK, $payload, $now);
                $stats['sent']++;
            });

        return $stats;
    }

    /**
     * Congratulate a member who just finished a session.
     *
     * Run shortly after a workout is completed. Positive reinforcement on the
     * action itself is what turns a single session into a habit, and it costs
     * nothing to send.
     */
    public function sendPostWorkoutPraise(?Carbon $now = null): array
    {
        $now ??= Carbon::now();
        $stats = ['sent' => 0, 'skipped' => 0];

        // Sessions finished in the last few hours that have not been praised.
        $sessions = WorkoutSession::whereNotNull('finished_at')
            ->where('finished_at', '>=', $now->copy()->subHours(3))
            ->with('user')
            ->get();

        foreach ($sessions as $session) {
            $member = $session->user;

            if ($member === null || ! $member->remind_post_workout) {
                $stats['skipped']++;

                continue;
            }

            if (! $member->canAccessPanel() === false && ! $this->hasCoach($member)) {
                $stats['skipped']++;

                continue;
            }

            $payload = $this->buildPraisePayload($member, $session);
            $this->dispatch($member, self::KIND_POST_WORKOUT, $payload, $now, perSession: $session->id);
            $stats['sent']++;
        }

        return $stats;
    }

    /**
     * Weekly summary: how many of the scheduled sessions were completed.
     *
     * Sent once a week regardless of performance, because a member who hit
     * every session deserves the acknowledgement and a member who missed some
     * needs the nudge more than anyone.
     */
    public function sendWeeklyRecaps(?Carbon $now = null): array
    {
        $now ??= Carbon::now();
        $stats = ['sent' => 0, 'skipped' => 0];

        $weekStart = $now->copy()->startOfWeek();
        $weekEnd = $now->copy()->endOfWeek();

        $this->membersWithCoach()
            ->filter(fn (User $u) => (bool) $u->remind_weekly_recap)
            ->each(function (User $member) use ($weekStart, $weekEnd, $now, &$stats) {
                $assignment = $this->activeAssignment($member);
                $scheduledDays = $assignment?->schedules->count() ?? 0;

                $completed = WorkoutSession::where('user_id', $member->id)
                    ->whereNotNull('finished_at')
                    ->whereBetween('finished_at', [$weekStart, $weekEnd])
                    ->count();

                $payload = $this->buildWeeklyPayload($member, $completed, $scheduledDays);
                $this->dispatch($member, self::KIND_WEEKLY_RECAP, $payload, $now);
                $stats['sent']++;
            });

        return $stats;
    }

    /**
     * Nudge about a session that was scheduled today and has not happened.
     *
     * Sent in the evening, before the day is written off, so there is still
     * time to act on it.
     */
    public function sendMissedSessionNudges(?Carbon $now = null): array
    {
        $now ??= Carbon::now();
        $isoDay = (int) $now->isoWeekday();
        $stats = ['sent' => 0, 'skipped' => 0];

        $this->membersWithCoach()
            ->filter(fn (User $u) => (bool) $u->remind_missed_session)
            ->each(function (User $member) use ($isoDay, $now, &$stats) {
                $assignment = $this->activeAssignment($member);
                $slot = $assignment?->schedules->firstWhere('day_of_week', $isoDay);

                if ($slot === null || $this->trainedOn($member, $now)) {
                    $stats['skipped']++;

                    return;
                }

                $payload = $this->buildMissedPayload($member, $slot);
                $this->dispatch($member, self::KIND_MISSED_SESSION, $payload, $now);
                $stats['sent']++;
            });

        return $stats;
    }

    // ------------------------------------------------------------------
    // Delivery
    // ------------------------------------------------------------------

    /**
     * Send a payload on every eligible channel, logging each attempt.
     *
     * @param  array<string, mixed>  $payload
     * @return array{sent: int, skipped: int}
     */
    private function dispatch(User $member, string $kind, array $payload, Carbon $now, ?int $perSession = null): array
    {
        $result = ['sent' => 0, 'skipped' => 0];
        $forDate = $now->toDateString();

        foreach ($this->channels as $channel) {
            if (! $channel->isConfigured() || ! $channel->isEnabledFor($member)) {
                $result['skipped']++;

                continue;
            }

            // The unique index on (user, kind, channel, for_date) is what
            // actually prevents a double send; this check just avoids the
            // pointless provider call.
            if ($this->alreadySent($member, $kind, $channel->key(), $forDate, $perSession)) {
                $result['skipped']++;

                continue;
            }

            try {
                $ok = $channel->send($member, $payload);

                ReminderSend::create([
                    'user_id' => $member->id,
                    'kind' => $kind,
                    'channel' => $channel->key(),
                    'for_date' => $forDate,
                    'sent_at' => $ok ? $now : null,
                    'status' => $ok ? 'sent' : 'failed',
                ]);

                $ok ? $result['sent']++ : $result['skipped']++;
            } catch (\Illuminate\Database\QueryException $e) {
                // Lost the race against a concurrent run — the other process
                // sent it, which is the desired outcome.
                $result['skipped']++;
            } catch (\Throwable $e) {
                Log::error('ReminderService: channel threw', [
                    'user_id' => $member->id,
                    'kind' => $kind,
                    'channel' => $channel->key(),
                    'error' => $e->getMessage(),
                ]);
                $result['skipped']++;
            }
        }

        return $result;
    }

    private function alreadySent(User $member, string $kind, string $channel, string $forDate, ?int $perSession): bool
    {
        return ReminderSend::where('user_id', $member->id)
            ->where('kind', $kind)
            ->where('channel', $channel)
            ->where('for_date', $forDate)
            ->where('status', 'sent')
            ->exists();
    }

    // ------------------------------------------------------------------
    // Payload builders (locale-aware)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function buildMorningPayload(User $member, $slot, ?TrainerAssignment $assignment): array
    {
        app()->setLocale($member->locale ?? 'en');

        $focus = $slot->focus ?: __('messages.reminder.training_generic');
        $trainer = $assignment?->trainer?->name;

        return [
            'type' => 'reminder',
            'subject' => __('messages.reminder.morning_subject', ['focus' => $focus]),
            'title' => __('messages.reminder.morning_title', ['focus' => $focus]),
            'text' => __('messages.reminder.morning_body', ['focus' => $focus]),
            'lines' => array_filter([
                __('messages.reminder.morning_line1'),
                $trainer !== null ? __('messages.reminder.morning_line_trainer', ['name' => $trainer]) : null,
            ]),
            'action_label' => __('messages.reminder.action_start'),
            'action_url' => rtrim(config('app.url'), '/').'/workout',
        ];
    }

    /** @return array<string, mixed> */
    private function buildStreakPayload(User $member, int $missed): array
    {
        app()->setLocale($member->locale ?? 'en');

        return [
            'type' => 'reminder',
            'subject' => __('messages.reminder.streak_subject'),
            'title' => __('messages.reminder.streak_title'),
            'text' => __('messages.reminder.streak_body', ['count' => $missed]),
            'lines' => [
                __('messages.reminder.streak_line1', ['count' => $missed]),
                __('messages.reminder.streak_line2'),
            ],
            'action_label' => __('messages.reminder.action_resume'),
            'action_url' => rtrim(config('app.url'), '/').'/workout',
        ];
    }

    /** @return array<string, mixed> */
    private function buildPraisePayload(User $member, WorkoutSession $session): array
    {
        app()->setLocale($member->locale ?? 'en');

        $exercises = $session->workoutExercises()->count();

        return [
            'type' => 'reminder',
            'subject' => __('messages.reminder.praise_subject'),
            'title' => __('messages.reminder.praise_title'),
            'text' => __('messages.reminder.praise_body', ['count' => $exercises]),
            'lines' => [
                __('messages.reminder.praise_line1', ['count' => $exercises]),
                __('messages.reminder.praise_line2'),
            ],
            'action_label' => __('messages.reminder.action_view'),
            'action_url' => rtrim(config('app.url'), '/').'/history',
        ];
    }

    /** @return array<string, mixed> */
    private function buildWeeklyPayload(User $member, int $completed, int $scheduled): array
    {
        app()->setLocale($member->locale ?? 'en');

        // Only phrase it as a win when they actually met the plan; otherwise
        // this reads as an automated congratulations for underperforming.
        $met = $scheduled > 0 && $completed >= $scheduled;

        return [
            'type' => 'reminder',
            'subject' => $met
                ? __('messages.reminder.weekly_subject_met')
                : __('messages.reminder.weekly_subject'),
            'title' => $met
                ? __('messages.reminder.weekly_title_met')
                : __('messages.reminder.weekly_title'),
            'text' => __('messages.reminder.weekly_body', ['completed' => $completed, 'scheduled' => $scheduled]),
            'lines' => [
                __('messages.reminder.weekly_line1', ['completed' => $completed, 'scheduled' => $scheduled]),
                $met ? __('messages.reminder.weekly_line_met') : __('messages.reminder.weekly_line_more'),
            ],
            'action_label' => __('messages.reminder.action_view'),
            'action_url' => rtrim(config('app.url'), '/').'/progress',
        ];
    }

    /** @return array<string, mixed> */
    private function buildMissedPayload(User $member, $slot): array
    {
        app()->setLocale($member->locale ?? 'en');

        $focus = $slot->focus ?: __('messages.reminder.training_generic');

        return [
            'type' => 'reminder',
            'subject' => __('messages.reminder.missed_subject'),
            'title' => __('messages.reminder.missed_title', ['focus' => $focus]),
            'text' => __('messages.reminder.missed_body'),
            'lines' => [
                __('messages.reminder.missed_line1', ['focus' => $focus]),
                __('messages.reminder.missed_line2'),
            ],
            'action_label' => __('messages.reminder.action_start'),
            'action_url' => rtrim(config('app.url'), '/').'/workout',
        ];
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /**
     * Members who currently have a coach.
     *
     * Filters out admins, trainers (they are not being coached) and suspended
     * accounts, so the reminder runs only over people for whom the message
     * makes sense.
     *
     * @return Collection<int, User>
     */
    private function membersWithCoach(): Collection
    {
        return User::where('role', User::ROLE_USER)
            ->where('is_suspended', false)
            ->whereHas('trainerAssignments', function ($q) {
                $q->where('status', TrainerAssignment::STATUS_ACTIVE);
            })
            ->with(['profile', 'trainerAssignments.trainer', 'trainerAssignments.schedules'])
            ->get()
            ->each(function (User $u) {
                // Eager-load the relation the payloads read, so the loop does
                // not issue a query per member.
                $u->setRelation(
                    'activeAssignment',
                    $u->trainerAssignments->firstWhere('status', TrainerAssignment::STATUS_ACTIVE),
                );
            });
    }

    private function hasCoach(User $member): bool
    {
        return $member->trainerAssignments()
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->exists();
    }

    private function activeAssignment(User $member): ?TrainerAssignment
    {
        if ($member->relationLoaded('activeAssignment')) {
            return $member->getRelation('activeAssignment');
        }

        return $member->trainerAssignments()
            ->where('status', TrainerAssignment::STATUS_ACTIVE)
            ->with(['trainer', 'schedules'])
            ->first();
    }

    private function trainedOn(User $member, Carbon $day): bool
    {
        return WorkoutSession::where('user_id', $member->id)
            ->whereNotNull('finished_at')
            ->whereDate('finished_at', $day->toDateString())
            ->exists();
    }

    /**
     * Count scheduled sessions in the last two weeks that were not done.
     *
     * Walks the schedule backwards day by day rather than comparing raw dates,
     * so a member who trains twice a week is judged against their own plan.
     */
    private function missedSessionsCount(User $member, Carbon $now, int $lookbackDays = 14): int
    {
        $assignment = $this->activeAssignment($member);

        if ($assignment === null || $assignment->schedules->isEmpty()) {
            return 0;
        }

        $scheduledDays = $assignment->schedules->pluck('day_of_week')->all();
        $missed = 0;
        $cursor = $now->copy()->subDay();

        for ($i = 0; $i < $lookbackDays; $i++) {
            if (in_array((int) $cursor->isoWeekday(), $scheduledDays, true)) {
                if (! $this->trainedOn($member, $cursor)) {
                    $missed++;
                }
            }
            $cursor->subDay();
        }

        return $missed;
    }
}
