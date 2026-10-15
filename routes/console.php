<?php

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Scheduled tasks
|--------------------------------------------------------------------------
|
| Times are in the app's timezone (config/app.php). They are set to Indonesian
| waking hours because the reminders are for members training in Indonesia: a
| "time to train" message that arrives at 3am local is worse than none.
|
| Every reminder sweep is idempotent per member per day, so a scheduler that
| double-fires (a deploy restart, a clock adjustment) cannot spam anyone.
|
*/

/*
 * Morning nudge on a training day.
 *
 * Sent before the working day starts so the member can plan around it. This is
 * the reminder with the largest effect on adherence, because it arrives before
 * the decision to skip has been made rather than after.
 */
Schedule::command('reminders:send --only=morning')
    ->dailyAt('06:30')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

/*
 * Missed-session nudge.
 *
 * Evening, while the day can still be salvaged — a member who reads this at
 * 19:00 can still train; the same message at 23:30 cannot be acted on.
 */
Schedule::command('reminders:send --only=missed')
    ->dailyAt('19:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

/*
 * Streak-break warning.
 *
 * Mid-morning, after the morning nudge has had a chance to work. Only fires for
 * members who have missed three or more scheduled sessions in the last two
 * weeks, so it stays a genuine signal rather than a second daily nag.
 */
Schedule::command('reminders:send --only=streak')
    ->dailyAt('10:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

/*
 * Post-workout praise.
 *
 * Runs several times a day because it keys off sessions finishing, not a fixed
 * hour — a member who trains at 06:00 and one who trains at 21:00 both deserve
 * the acknowledgement while it is still recent.
 */
Schedule::command('reminders:send --only=praise')
    ->everyTwoHours()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

/*
 * Weekly recap.
 *
 * Sunday evening, closing the training week on a reviewable note.
 */
Schedule::command('reminders:send --only=weekly')
    ->weeklyOn(7, '18:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

/*
 * Missed-session penalties.
 *
 * Runs late, after the evening missed-session nudge has had its chance, so a
 * member who trains at 20:00 is not penalised before they could have acted. The
 * sweep is idempotent per (member, date), so a double fire cannot double-charge.
 */
Schedule::command('striv:missed-session-penalties')
    ->dailyAt('23:30')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

