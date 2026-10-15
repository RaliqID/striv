<?php

namespace Database\Seeders;

use App\Models\Exercise;
use App\Models\Profile;
use App\Models\TrainerAssignment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * A complete, professional trainer roster plus demo accounts that exercise
 * every state in the training system.
 *
 * Credentials are deliberately fixed and printed at the end so the demo can be
 * driven without hunting through the database. This seeder is for development
 * only â€” it creates accounts with known passwords.
 */
class DemoSeeder extends Seeder
{
    public const DEMO_PASSWORD = 'password';

    /**
     * Lifecycle stage for a demo member.
     *
     * The interesting failure in a demo is not "no data" but "one state, so
     * half the screens look identical". Driving accounts off an explicit stage
     * keeps the fixture honest: every branch of the matching flow has a real
     * account behind it.
     */
    /** Matched to a trainer, schedule confirmed, actively training. */
    private const STAGE_ACTIVE = 'active';

    /** Matched to a trainer, but no schedule agreed yet. */
    private const STAGE_AWAITING = 'awaiting_schedule';

    /** No trainer available â€” sits in the admin queue. */
    private const STAGE_UNMATCHED = 'unmatched';

    /**
     * The trainer roster.
     *
     * Each trainer has a real specialisation, a credential line and a coaching
     * philosophy, because a bio of "lorem ipsum" makes the matching feature
     * impossible to evaluate â€” and because a member reading it decides whether
     * the system paired them sensibly.
     */
    private const TRAINERS = [
        [
            'name' => 'Coach Raka Pratama',
            'email' => 'raka@striv.test',
            'specialization' => 'muscle',
            'capacity' => 20,
            'bio' => 'SSC-certified hypertrophy coach, 8 years. Specialises in taking beginners through their first structured build: technique first, load second. Runs 3-day and 4-day upper/lower splits with mandatory form checks in the first month.',
        ],
        [
            'name' => 'Coach Dita Anggraini',
            'email' => 'dita@striv.test',
            'specialization' => 'strength',
            'capacity' => 15,
            'bio' => 'National-level powerlifter and coach. Works the squat, bench and deadlift with lifters chasing measurable strength. Programs progressive overload in 4-week blocks with a deload built in.',
        ],
        [
            'name' => 'Coach Bagas Nugroho',
            'email' => 'bagas@striv.test',
            'specialization' => 'endurance',
            'capacity' => 25,
            'bio' => 'Endurance and conditioning coach, ex-national runner. Builds aerobic base without sacrificing strength, using heart-rate-zone work and circuit conditioning.',
        ],
        [
            'name' => 'Coach Sari Wijaya',
            'email' => 'sari@striv.test',
            'specialization' => 'muscle',
            'capacity' => 18,
            'bio' => 'Nutrition-certified physique coach. Pairs training volume with practical eating guidance for members whose goal is body composition rather than the bar.',
        ],
        [
            'name' => 'Coach Adi Saputra',
            'email' => 'adi@striv.test',
            'specialization' => 'strength',
            'capacity' => 12,
            'bio' => 'Strength coach with a rehab background. Suited to members returning from injury who need conservative loading and close technique supervision.',
        ],
        [
            'name' => 'Coach Maya Kusuma',
            'email' => 'maya@striv.test',
            'specialization' => 'endurance',
            'capacity' => 22,
            'bio' => 'Functional training and conditioning specialist. Metcon-style sessions for members who want general fitness and work capacity rather than a single-lift focus.',
        ],
    ];

    /**
     * Demo members, one per lifecycle stage.
     *
     * `goal` drives which trainer the matcher should pick, so the demo proves
     * the specialisation preference is real rather than asserted.
     */
    private const MEMBERS = [
        [
            'name' => 'Demo Member',
            'email' => 'member@striv.test',
            'goal' => 'muscle',
            'experience' => 'beginner',
            'stage' => self::STAGE_ACTIVE,
            'age' => 24,
            'location' => 'Jakarta',
            'weight_kg' => 62.5,
            'height_cm' => 172.0,
            'target_weight_kg' => 70.0,
            'training_frequency' => 4,
        ],
        [
            'name' => 'Demo Awaiting Schedule',
            'email' => 'awaiting@striv.test',
            'goal' => 'strength',
            'experience' => 'intermediate',
            'stage' => self::STAGE_AWAITING,
            'age' => 29,
            'location' => 'Bandung',
            'weight_kg' => 78.0,
            'height_cm' => 178.0,
            'target_weight_kg' => 82.0,
            'training_frequency' => 3,
        ],
        [
            'name' => 'Demo Beginner',
            'email' => 'beginner@striv.test',
            'goal' => 'endurance',
            'experience' => 'beginner',
            'stage' => self::STAGE_ACTIVE,
            'age' => 31,
            'location' => 'Surabaya',
            'weight_kg' => 85.0,
            'height_cm' => 170.0,
            'target_weight_kg' => 75.0,
            'training_frequency' => 5,
        ],
    ];

    public function run(): void
    {
        $this->command->info('Seeding admin account...');
        $this->upsertAdmin();

        $this->command->info('Seeding professional trainer roster...');
        foreach (self::TRAINERS as $data) {
            $this->upsertTrainer($data);
        }

        $this->command->info('Seeding demo members...');
        foreach (self::MEMBERS as $data) {
            $this->upsertMember($data);
        }

        $this->printCredentials();
    }

    /**
     * A ready-to-use administrator.
     *
     * Created here rather than relying on AdminUserSeeder, which only promotes
     * accounts that already exist â€” a fresh database would otherwise have no
     * way into the admin panel at all.
     */
    private function upsertAdmin(): User
    {
        $admin = User::firstOrNew(['email' => 'admin@striv.test']);

        $admin->fill([
            'name' => 'Demo Admin',
            'role' => User::ROLE_ADMIN,
            'is_suspended' => false,
        ]);

        if (! $admin->exists) {
            $admin->password = Hash::make(self::DEMO_PASSWORD);
        }

        $admin->save();

        if ($admin->profile === null) {
            Profile::create([
                'user_id' => $admin->id,
                'experience_level' => 'advanced',
                'onboarding_completed_at' => now(),
            ]);
        }

        return $admin;
    }

    /** @param array<string, mixed> $data */
    private function upsertTrainer(array $data): User
    {
        $trainer = User::firstOrNew(['email' => $data['email']]);

        $trainer->fill([
            'name' => $data['name'],
            'role' => User::ROLE_TRAINER,
            'specialization' => $data['specialization'],
            'bio' => $data['bio'],
            'capacity' => $data['capacity'],
            'is_available' => true,
            'is_suspended' => false,
        ]);

        if (! $trainer->exists) {
            $trainer->password = Hash::make(self::DEMO_PASSWORD);
        }

        $trainer->save();

        // Trainers are users too; the panel reads onboarding state from profile.
        if ($trainer->profile === null) {
            Profile::create([
                'user_id' => $trainer->id,
                'experience_level' => 'advanced',
                'onboarding_completed_at' => now(),
            ]);
        }

        return $trainer;
    }

    /** @param array<string, mixed> $data */
    private function upsertMember(array $data): User
    {
        $member = User::firstOrNew(['email' => $data['email']]);

        $member->fill([
            'name' => $data['name'],
            'role' => User::ROLE_USER,
            'is_suspended' => false,
        ]);

        if (! $member->exists) {
            $member->password = Hash::make(self::DEMO_PASSWORD);
        }

        $member->save();

        Profile::updateOrCreate(
            ['user_id' => $member->id],
            [
                'age' => $data['age'],
                'location' => $data['location'],
                'weight_kg' => $data['weight_kg'],
                'height_cm' => $data['height_cm'],
                'target_weight_kg' => $data['target_weight_kg'],
                'experience_level' => $data['experience'],
                'primary_goal' => $data['goal'],
                'training_frequency' => $data['training_frequency'],
                'onboarding_completed_at' => now(),
            ],
        );

        $this->applyStage($member->refresh(), $data['stage']);

        return $member;
    }

    /**
     * Put a member into their assigned lifecycle stage.
     *
     * Matching is driven through the real service rather than by writing
     * assignment rows directly, so the demo data is produced by the same code
     * path production uses - if the matcher breaks, this seeder breaks with it
     * instead of quietly writing plausible rows that the app could never make.
     */
    private function applyStage(User $member, string $stage): void
    {
        $matching = app(\App\Services\Training\TrainerMatchingService::class);

        // Clean slate so re-running does not stack assignments.
        $member->trainerAssignments()->delete();
        $member->trainingRequests()->delete();

        if ($stage === self::STAGE_UNMATCHED) {
            // Deliberately no match: leave the request pending.
            $matching->requestFor($member, $member->profile?->primary_goal);

            return;
        }

        $request = $matching->requestAndMatch($member, $member->profile?->primary_goal);
        $assignment = \App\Models\TrainerAssignment::where('user_id', $member->id)
            ->where('status', 'active')
            ->latest('id')
            ->first();

        if ($assignment === null) {
            $this->command->warn("  {$member->email}: no trainer available (all at capacity?)");

            return;
        }

        if ($stage === self::STAGE_ACTIVE) {
            $this->activateAssignment($assignment);
            // History is what makes the trainer's stats, history and volume
            // panels meaningful — without it every client reads as inactive.
            $this->seedWorkoutHistory($member, $assignment);
        }

        $this->command->line("  {$member->email} -> {$assignment->trainer->name} ({$stage})");
    }

    /**
     * Generate a believable block of completed sessions for a member.
     *
     * Sessions are back-dated across the last few weeks and step the load up
     * gradually, so the progress charts, volume totals and personal-record
     * detection all have a real trend to work with rather than flat noise.
     * Idempotent: existing sessions for the member are cleared first.
     */
    private function seedWorkoutHistory(User $member, TrainerAssignment $assignment): void
    {
        $member->workoutSessions()->delete();

        $goal = $member->profile?->primary_goal ?? 'muscle';
        $exerciseNames = match ($goal) {
            'strength' => ['Squat', 'Barbell Bench Press', 'Deadlift'],
            'endurance' => ['Squat', 'Push-ups', 'Planks'],
            default => ['Barbell Bench Press', 'Squat', 'Lat Pulldown'],
        };

        $exercises = Exercise::whereIn('name', $exerciseNames)->get();

        if ($exercises->isEmpty()) {
            $this->command->warn('  exercise catalogue empty; skipping history');

            return;
        }

        $baseWeight = match ($goal) {
            'strength' => 50.0,
            'endurance' => 20.0,
            default => 30.0,
        };

        // Eight sessions, roughly twice a week, oldest first.
        //
        // Iterated oldest -> newest on purpose. Seeding newest-first and then
        // increasing load by index produced a dataset where the most recent
        // session was the LIGHTEST, so the strength trend came out negative
        // (-36%) while the comment claimed progression. The index now tracks
        // time order, so age and load move in the correct directions together.
        $sessionCount = 8;

        foreach (range(1, $sessionCount) as $i) {
            // $i = 1 is the oldest (six weeks back); the last is most recent.
            $daysAgo = 2 + (($sessionCount - $i) * 4);
            $startedAt = now()->subDays($daysAgo)->setTime(18, 0);
            $finishedAt = $startedAt->copy()->addMinutes(62);

            $session = \App\Models\WorkoutSession::create([
                'user_id' => $member->id,
                'started_at' => $startedAt,
                'finished_at' => $finishedAt,
                'duration_minutes' => 62,
                'notes' => $i === 1 ? 'First session of the block.' : null,
            ]);

            foreach ($exercises->values() as $order => $exercise) {
                $workoutExercise = \App\Models\WorkoutExercise::create([
                    'workout_session_id' => $session->id,
                    'exercise_id' => $exercise->id,
                    'order' => $order + 1,
                ]);

                $sets = $goal === 'endurance' ? 3 : 4;
                // Ascending load in time order: +2.5 kg per session, stepped
                // down for accessory movements so the main lift leads.
                $weight = $baseWeight + ($i * 2.5) - ($order * 3);

                foreach (range(1, $sets) as $setNumber) {
                    \App\Models\WorkoutSet::create([
                        'workout_exercise_id' => $workoutExercise->id,
                        'set_number' => $setNumber,
                        'weight_kg' => max(5, round($weight, 1)),
                        // Kept at or below 12 reps: StrengthService::estimated1rm
                        // deliberately excludes higher-rep sets as unreliable,
                        // so a 15-rep endurance scheme would yield no trend data
                        // at all rather than a meaningful one.
                        'reps' => $goal === 'strength' ? 5 : 10,
                        'rpe' => 7 + min(2, intdiv($setNumber, 3)),
                    ]);
                }
            }
        }
    }

    /**
     * Move a freshly matched assignment into the fully-active state: schedule
     * agreed, programme prescribed.
     */
    private function activateAssignment(\App\Models\TrainerAssignment $assignment): void
    {
        $assignment->forceFill(['confirmed_at' => now()])->save();

        $assignment->trainingRequest?->forceFill([
            'status' => \App\Models\TrainingRequest::STATUS_ACTIVE,
            'activated_at' => now(),
        ])->save();

        // A realistic schedule shaped by the member's stated frequency.
        $frequency = (int) ($assignment->user->profile?->training_frequency ?? 3);
        $days = match (true) {
            $frequency >= 5 => [1, 2, 3, 5, 6],
            $frequency >= 4 => [1, 3, 5, 6],
            $frequency >= 3 => [1, 3, 5],
            default => [2, 4],
        };

        $focusByGoal = match ($assignment->user->profile?->primary_goal) {
            'strength' => ['Squat / Bench focus', 'Deadlift focus', 'Accessory + technique'],
            'endurance' => ['Zone 2 base', 'Interval conditioning', 'Circuit + core'],
            default => ['Upper body push', 'Lower body', 'Upper body pull'],
        };

        foreach ($days as $i => $day) {
            \App\Models\TrainerSchedule::create([
                'trainer_assignment_id' => $assignment->id,
                'day_of_week' => $day,
                'time_slot' => ['18:00-19:30', '06:30-08:00', '19:00-20:30'][$i % 3],
                'focus' => $focusByGoal[$i % count($focusByGoal)],
                'proposed_by' => 'trainer',
                'confirmed_at' => now(),
                'member_response' => 'accepted',
                'member_responded_at' => now(),
            ]);
        }

        $this->prescribeProgram($assignment);
    }

    /**
     * Prescribe a starter programme, authored by the trainer.
     *
     * Exercises are drawn from the real seeded catalogue so the programme
     * screen has names, equipment and muscle groups to render.
     */
    private function prescribeProgram(\App\Models\TrainerAssignment $assignment): void
    {
        $goal = $assignment->user->profile?->primary_goal ?? 'muscle';

        /*
         * Names must match the seeded catalogue exactly. The catalogue is a
         * strength-focused list (no cardio movements), so an endurance member
         * gets a conditioning circuit built from the strength movements that
         * exist rather than a name that will not resolve.
         */
        $pickNames = match ($goal) {
            'strength' => ['Squat', 'Barbell Bench Press', 'Deadlift', 'Overhead Press'],
            'endurance' => ['Squat', 'Planks', 'Push-ups', 'Leg Raises'],
            default => ['Barbell Bench Press', 'Squat', 'Lat Pulldown', 'Dumbbell Shoulder Press'],
        };

        $exercises = \App\Models\Exercise::whereIn('name', $pickNames)->get();

        if ($exercises->isEmpty()) {
            // Catalogue not seeded â€” skip rather than failing the whole demo.
            $this->command->warn('  exercise catalogue empty; skipping programme');

            return;
        }

        $routine = \App\Models\Routine::firstOrCreate(
            [
                'trainer_assignment_id' => $assignment->id,
                // Plain hyphen, not an em-dash: this string survives any
                // editor/encoding round-trip, which an em-dash demonstrably
                // does not (it arrived here double-encoded as "â€”").
                'name' => 'Week 1 - '.ucfirst((string) $goal).' Foundation',
            ],
            [
                'user_id' => $assignment->user_id,
                'notes' => 'Starter block. Focus on controlled tempo, full range of motion. Load increases only after all sets are completed at the target reps.',
                'est_duration_minutes' => 60,
            ],
        );

        if ($routine->routineExercises()->exists()) {
            return;
        }

        foreach ($exercises->values() as $i => $exercise) {
            \App\Models\RoutineExercise::create([
                'routine_id' => $routine->id,
                'exercise_id' => $exercise->id,
                'order' => $i + 1,
                'target_sets' => $goal === 'endurance' ? 3 : 4,
                'target_reps' => $goal === 'strength' ? 5 : ($goal === 'endurance' ? 12 : 8),
                'target_weight_kg' => $goal === 'strength' ? 60 : null,
            ]);
        }
    }

    /** Print the credentials so the demo can be driven immediately. */
    private function printCredentials(): void
    {
        $this->command->newLine();
        $this->command->info('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
        $this->command->info(' DEMO ACCOUNTS  (password for all: '.self::DEMO_PASSWORD.')');
        $this->command->info('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
        $this->command->line(' ADMIN      admin@striv.test        full panel access');
        $this->command->line(' TRAINER    raka@striv.test         hypertrophy');
        $this->command->line(' TRAINER    dita@striv.test         strength');
        $this->command->line(' TRAINER    bagas@striv.test        endurance');
        $this->command->line(' TRAINER    sari@striv.test         hypertrophy/nutrition');
        $this->command->line(' TRAINER    adi@striv.test          strength/rehab');
        $this->command->line(' TRAINER    maya@striv.test         conditioning');
        $this->command->line(' MEMBER     member@striv.test       active (schedule + programme)');
        $this->command->line(' MEMBER     awaiting@striv.test     matched, schedule pending');
        $this->command->line(' MEMBER     beginner@striv.test     active, endurance goal');
        $this->command->info('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
    }
}
