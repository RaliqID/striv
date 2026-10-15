<?php

/*
|--------------------------------------------------------------------------
| Application messages (English)
|--------------------------------------------------------------------------
|
| Messages returned by the API and rendered in the interface, plus the copy the
| reminder system sends. Grouped by domain so related strings sit together and
| a missing key is findable from the code that uses it.
|
*/

return [
    // Generic
    'saved' => 'Saved.',
    'updated' => 'Updated.',
    'deleted' => 'Deleted.',
    'unauthorized' => 'You need to sign in to continue.',
    'forbidden' => 'You do not have access to this.',

    // Auth
    'auth.logged_out' => 'Signed out.',
    'auth.invalid_credentials' => 'The provided credentials are incorrect.',
    'auth.suspended' => 'Account suspended. Contact support.',
    'auth.too_many_attempts' => 'Too many login attempts. Please try again in :minutes minute(s).',

    // Training — member side
    'training.request_queued' => 'Your request is queued — we will assign a trainer as soon as one is free.',
    'training.trainer_assigned' => 'A trainer has been assigned to you.',
    'training.no_active_trainer' => 'You do not have an active trainer.',
    'training.slot_proposed' => 'Slot proposed. Your trainer will confirm it.',
    'training.slot_confirmed' => 'Slot confirmed.',
    'training.slot_declined' => 'Slot declined.',
    'training.released_rematched' => 'Your trainer has been changed. A new trainer is assigned.',
    'training.released_waiting' => 'Your trainer was released. We will assign a new one as soon as one is free.',
    'training.rating_thanks' => 'Thanks — your rating helps us match members better.',

    // Training — trainer side
    'training.not_coaching' => 'You are not coaching this member.',
    'training.no_active_relationship' => 'No active coaching relationship.',
    'training.feedback_sent' => 'Feedback sent.',
    'training.live_note_sent' => 'Live note sent.',
    'training.schedule_sent' => 'Schedule sent to your client for confirmation.',
    'training.program_assigned' => 'Programme assigned to your client.',
    'training.program_removed' => 'Programme removed.',
    'training.availability_on' => 'You are accepting new clients.',
    'training.availability_off' => 'You will not receive new clients.',

    // Training — admin
    'training.already_has_trainer' => 'This request already has a trainer.',
    'training.not_a_trainer' => 'That user is not a trainer.',
    'training.trainer_suspended' => 'That trainer is suspended.',
    'training.assigned' => 'Trainer assigned.',
    'training.reassigned' => 'Member reassigned.',
    'training.already_coached_by' => 'Already coached by that trainer.',
    'training.already_trainer' => 'Already a trainer.',
    'training.trainer_created' => 'Trainer created.',
    'training.trainer_created_matched' => 'Trainer created. :count waiting member(s) assigned.',
    'training.rematch_none' => 'No members could be matched — all trainers may be at capacity.',
    'training.rematch_done' => 'Assigned :count waiting member(s).',

    // Role change
    'role.changed' => 'Role changed from :from to :to.',
    'role.unchanged' => 'Role unchanged.',

    // Notifications (in-app + email)
    'notify.trainer_assigned_title' => 'Your personal trainer is ready',
    'notify.trainer_assigned_body' => ':name has been assigned to you. They will confirm your schedule shortly.',
    'notify.client_assigned_title' => 'New client assigned',
    'notify.client_assigned_body' => 'You are now coaching :name. Confirm their schedule to get started.',
    'notify.schedule_proposed_title' => 'Your trainer proposed a schedule',
    'notify.schedule_proposed_body' => ':name suggested :count training day(s). Review and confirm.',
    'notify.schedule_confirmed_title' => 'Schedule confirmed',
    'notify.schedule_confirmed_body' => ':name accepted the training schedule.',
    'notify.client_waiting_title' => 'A member is waiting for a trainer',
    'notify.client_waiting_body' => ':name requested coaching',
    'notify.client_waiting_body_goal' => ':name requested coaching for :goal.',
    'notify.released_title' => 'Your trainer has changed',
    'notify.released_body' => 'Your previous trainer is no longer available. We are finding you a new one.',
    'notify.live_note_title' => 'Live coaching note',
    'notify.feedback_title' => 'New note from your trainer',
    'notify.feedback_body' => ':name left you feedback.',
    'notify.feedback_body_session' => ':name left you feedback on your workout.',
    'notify.rating_title' => 'You received a rating',
    'notify.rating_body' => ':name rated your coaching :rating/5.',

    // Locale
    'locale.updated' => 'Language updated.',

    // ------------------------------------------------------------------
    // Consistency reminders
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Generated programme coaching notes
    //
    // Rendered at read time from the stored goal/experience/frequency, so they
    // follow the member's language instead of being frozen in English.
    // ------------------------------------------------------------------
    'program.note_goal_muscle' => 'Hypertrophy focus. Control the lowering phase (2-3 seconds) and leave 1-2 reps in reserve on every set.',
    'program.note_goal_strength' => 'Built around the main lifts. Rest 2-3 minutes between sets - the goal is force, not fatigue.',
    'program.note_goal_endurance' => 'Conditioning focus. Keep rest under 60 seconds and aim to finish each set breathing hard but controlled.',

    'program.note_experience_beginner' => 'Technique first. Use a load you can control for every rep, and stop the set if form breaks down.',
    'program.note_experience_intermediate' => 'Progressive overload: add the smallest available increment once all sets hit the target reps.',
    'program.note_experience_advanced' => 'Volume is set for an experienced lifter. Adjust if recovery is compromised.',

    'program.note_frequency' => 'Scheduled around :count training days a week.',
    'program.note_frequency_high' => 'You train :count days a week, so keep individual sessions short and prioritise sleep.',
    'program.note_review' => 'Your trainer will review this and adjust the loading after your first session.',
    // ------------------------------------------------------------------
    // Workout photo evidence
    // ------------------------------------------------------------------
    'photo.invalid_image' => 'That image could not be read. Try taking the photo again.',
    'photo.too_large' => 'That photo is too large. Try again — it will be resized automatically.',
    'photo.no_exercise' => 'This set is not linked to an exercise, so it cannot be verified.',
    'photo.not_found' => 'Photo not found.',
    'photo.accepted' => 'Photo verified — set complete.',
    'photo.accepted_unverified' => 'Photo saved, but the check could not run right now. Your trainer will review it.',
    'photo.rejected' => 'This photo does not look like the exercise you are logging. Take a photo of the actual equipment or movement.',
    'photo.removed' => 'Photo removed. The set is no longer marked complete.',
    'photo.required' => 'A photo is required to complete a set.',
    'photo.reviewed' => 'Reviewed by trainer.',
    // ------------------------------------------------------------------
    // AI coach conversations
    //
    // Stored titles, so they are localized when written rather than when read.
    // ------------------------------------------------------------------
    'chat.new_session' => 'New chat',
    'chat.photo_checkin' => 'Photo check-in',
    'reminder.training_generic' => 'training',

    // ------------------------------------------------------------------
    // Training insights
    //
    // Titles and summaries for detected patterns. Built at read time from the
    // pattern type + evidence, so they follow the member's language instead of
    // being frozen in English.
    // ------------------------------------------------------------------
    'insight.progress.title' => ':exercise strength is trending upward',
    'insight.progress.summary' => 'Estimated 1RM increased :pct% over :weeks weeks.',
    'insight.plateau.title' => ':exercise performance has plateaued',
    'insight.plateau.summary' => 'Estimated 1RM has stayed within :pct% over the last :weeks weeks.',
    'insight.regression.title' => ':exercise strength is declining',
    'insight.regression.summary' => 'Estimated 1RM decreased :pct% over :weeks weeks.',
    'insight.volume_up.title' => 'Training volume increased',
    'insight.volume_up.summary' => 'Weekly volume up :pct% compared with the previous period.',
    'insight.volume_down.title' => 'Training volume decreased',
    'insight.volume_down.summary' => 'Weekly volume down :pct% compared with the previous period.',
    'insight.consistency_up.title' => 'Training consistency improved',
    'insight.consistency_up.summary' => 'Adherence rose from :previous% to :recent% of your weekly target.',
    'insight.consistency_down.title' => 'Training consistency declined',
    'insight.consistency_down.summary' => 'Adherence dropped from :previous% to :recent% of your weekly target.',
    'insight.milestone.title' => ':count workouts completed',
    'insight.milestone.summary' => "You've logged :count total training sessions.",

    // Recommendation fallbacks (used when no AI provider is configured)
    'insight.rec.progress' => 'Consider adding 2.5kg to your next session to extend the trend.',
    'insight.rec.plateau' => 'Try a 5% intensity increase or a deload week, then test max.',
    'insight.rec.regression' => 'Schedule a recovery week and reassess sleep + nutrition before deloading.',
    'insight.rec.milestone' => 'Set a stretch goal for the next 100 sessions.',
    'insight.rec.default' => 'Keep training consistently and reassess next week.',
    'insight.rec.volume_up' => 'Maintain this volume; track RPE to avoid overreaching.',
    'insight.rec.volume_down' => 'Gradually reintroduce volume to baseline.',
    'insight.rec.volume_flat' => 'Keep current volume and monitor recovery.',
    'insight.rec.consistency_up' => 'Build on this — consider adding a 5th day if recovery allows.',
    'insight.rec.consistency_down' => 'Identify friction: time, energy, or recovery. Aim for minimum 2 sessions this week.',
    'insight.rec.consistency_flat' => 'Maintain your current schedule and protect recovery.',

    'reminder.morning_subject' => 'Today: :focus',
    'reminder.morning_title' => 'Today is :focus',
    'reminder.morning_body' => 'You are scheduled for :focus today. Your programme and targets are ready.',
    'reminder.morning_line1' => 'Everything you need is already set up — just work through it and log the numbers.',
    'reminder.morning_line_trainer' => ':name will see your session once you finish.',

    'reminder.streak_subject' => 'Your training has slipped',
    'reminder.streak_title' => 'You have missed :count sessions',
    'reminder.streak_body' => 'It has been a while since your last session.',
    'reminder.streak_line1' => 'You have missed :count scheduled sessions in the past two weeks.',
    'reminder.streak_line2' => 'Getting one session in today is enough to get back on track. Your programme is still there.',

    'reminder.praise_subject' => 'Session logged',
    'reminder.praise_title' => 'Nice work — session complete',
    'reminder.praise_body' => 'You finished a session with :count exercises.',
    'reminder.praise_line1' => ':count exercises logged and recorded against your programme.',
    'reminder.praise_line2' => 'Your trainer can see this session and will factor it into your plan.',

    'reminder.weekly_subject' => 'Your week in training',
    'reminder.weekly_title' => 'Weekly recap',
    'reminder.weekly_subject_met' => 'You hit your plan this week',
    'reminder.weekly_title_met' => 'Plan complete for the week',
    'reminder.weekly_body' => ':completed of :scheduled scheduled sessions completed.',
    'reminder.weekly_line1' => 'You completed :completed of :scheduled scheduled sessions this week.',
    'reminder.weekly_line_met' => 'That is the full plan — exactly the consistency that moves the numbers.',
    'reminder.weekly_line_more' => 'Any sessions you missed are still available; nothing is lost.',

    'reminder.missed_subject' => 'Today\'s session is still open',
    'reminder.missed_title' => ':focus is still on the table',
    'reminder.missed_body' => 'Your session for today has not been logged yet.',
    'reminder.missed_line1' => 'Today was scheduled for :focus and there is still time.',
    'reminder.missed_line2' => 'If today does not work, you can train tomorrow — the plan adapts.',

    'reminder.action_start' => 'Start today\'s session',
    'reminder.action_resume' => 'Get back in',
    'reminder.action_view' => 'View your progress',
    'reminder.phone_required' => 'Add a phone number before turning on WhatsApp reminders.',

    // Profile — avatar
    'profile.avatar_invalid' => 'That file is not a supported image. Use a JPEG, PNG or WebP photo.',
    'profile.avatar_too_large' => 'That photo is too large. Please choose one under 5 MB.',
    'profile.avatar_updated' => 'Profile photo updated.',
    'profile.avatar_removed' => 'Profile photo removed.',
    'profile.avatar_cooldown' => 'You can change your photo again in about :hours hour(s). Photos are limited to one change every two days.',
];
