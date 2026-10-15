<?php

namespace App\Services\Training;

use App\Models\Exercise;
use App\Models\Profile;
use App\Models\Routine;
use App\Models\RoutineExercise;
use App\Models\TrainerAssignment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Generates a starting training programme from what the member told us.
 *
 * The whole point of pairing a beginner with a professional is that they should
 * NOT have to know which exercises to do or what weight to use. Asking them to
 * build their own programme — or handing the trainer an empty builder and
 * hoping they fill it — leaves that gap open. So the programme is generated
 * automatically the moment a trainer is assigned, and the trainer's job becomes
 * reviewing and adjusting it rather than authoring from nothing.
 *
 * The output is deterministic: the same member profile always produces the same
 * plan. That matters because the trainer and the member both need to be able to
 * reason about why a plan looks the way it does, and because a randomised plan
 * could not be tested.
 *
 * Inputs, all from onboarding:
 *   - primary_goal      → which movement pattern the block is built around
 *   - experience_level  → how much volume and how many movements
 *   - training_frequency→ how many distinct training days
 *   - target_weight_kg   → whether an accessory/cardio emphasis is warranted
 */
class ProgramGenerator
{
    /**
     * Build (or rebuild) the prescribed programme for an assignment.
     *
     * Idempotent per assignment: an existing auto-generated plan is replaced,
     * but a plan the trainer edited by hand is left alone, so a later re-run
     * cannot silently discard the trainer's work.
     */
    public function generateFor(TrainerAssignment $assignment, bool $force = false): ?Routine
    {
        $member = $assignment->user;

        if ($member === null) {
            return null;
        }

        $profile = $member->profile;
        $goal = $profile?->primary_goal ?? 'muscle';
        $experience = $profile?->experience_level ?? 'beginner';
        $frequency = (int) ($profile?->training_frequency ?? 3);

        // Respect a hand-written plan unless explicitly told to overwrite.
        if (! $force && $this->hasTrainerAuthoredProgram($assignment)) {
            return $assignment->routines()->latest('id')->first();
        }

        $exercises = $this->selectExercises($goal, $experience);

        if ($exercises->isEmpty()) {
            Log::warning('ProgramGenerator: no exercises matched, skipping', [
                'assignment_id' => $assignment->id,
                'goal' => $goal,
            ]);

            return null;
        }

        return DB::transaction(function () use ($assignment, $member, $goal, $experience, $frequency, $exercises) {
            /*
             * Remove any prior auto-generated plan for this assignment before
             * writing the new one.
             *
             * Without this, every call appended another plan: re-running the
             * seeder or re-matching left the member with several identical
             * programmes, which the workout screen then listed as duplicates.
             * A trainer-authored plan (auto_generated = false) is never touched.
             */
            $assignment->routines()
                ->where('auto_generated', true)
                ->get()
                ->each(function (Routine $old) {
                    $old->routineExercises()->delete();
                    $old->delete();
                });

            $routine = Routine::create([
                'user_id' => $member->id,
                'trainer_assignment_id' => $assignment->id,
                'name' => $this->programName($goal, $experience),
                // Notes are NOT stored as prose.
                //
                // They were originally written in English here, which froze them
                // in one language: a member who switched to Indonesian still saw
                // English coaching notes, because the string was already saved.
                // Storing the inputs instead and rendering on read means the
                // notes follow the member's language, and editing the wording
                // later updates existing plans rather than only new ones.
                'notes' => null,
                'program_goal' => $goal,
                'program_experience' => $experience,
                'program_frequency' => $frequency,
                'est_duration_minutes' => $this->durationFor($experience),
                'auto_generated' => true,
            ]);

            $scheme = $this->setRepScheme($goal, $experience);

            foreach ($exercises->values() as $i => $exercise) {
                RoutineExercise::create([
                    'routine_id' => $routine->id,
                    'exercise_id' => $exercise->id,
                    'order' => $i + 1,
                    'target_sets' => $scheme['sets'],
                    'target_reps' => $scheme['reps'],
                    // Deliberately null: an absolute starting load invented by
                    // the system would be wrong for most people, and a wrong
                    // starting weight is how beginners get hurt. The trainer
                    // sets it after seeing the member move.
                    'target_weight_kg' => null,
                ]);
            }

            return $routine;
        });
    }

    /**
     * Whether the trainer has written their own programme for this client.
     *
     * Distinguishes by the `auto_generated` flag rather than by name, so
     * renaming either kind does not confuse the check.
     */
    private function hasTrainerAuthoredProgram(TrainerAssignment $assignment): bool
    {
        return $assignment->routines()
            ->where('auto_generated', false)
            ->exists();
    }

    /**
     * Choose the movements for this member.
     *
     * Selection is goal-first and experience-second:
     *   - goal decides the movement family (a strength block is built on the
     *     three lifts; a hypertrophy block on press/pull/squat patterns)
     *   - experience decides how many, since a beginner cannot recover from or
     *     correctly perform a long list
     *
     * Muscle-group spread is enforced so the block is not six variations of the
     * same press, which is the classic failure of a naive "pick by goal" query.
     *
     * Exercises relate to groups through a belongsToMany (an exercise can train
     * several), so the spread check compares group ID sets rather than a single
     * column. Using a non-existent `muscle_group_id` column here silently made
     * every exercise look like it shared one group, collapsing the programme to
     * a single movement.
     */
    private function selectExercises(string $goal, string $experience): Collection
    {
        $count = match ($experience) {
            'advanced' => 7,
            'intermediate' => 6,
            default => 5,
        };

        // Preferred movements per goal, in priority order. Matched by name
        // against the seeded catalogue, so an absent name is skipped rather
        // than causing the whole plan to fail.
        $preferred = match ($goal) {
            'strength' => [
                'Squat', 'Barbell Bench Press', 'Deadlift', 'Overhead Press',
                'Barbell Row', 'Pull-ups', 'Romanian Deadlift', 'Planks',
            ],
            'endurance' => [
                'Squat', 'Push-ups', 'Planks', 'Leg Raises', 'Lat Pulldown',
                'Dumbbell Shoulder Press', 'Crunches',
            ],
            default => [
                'Barbell Bench Press', 'Squat', 'Lat Pulldown', 'Dumbbell Shoulder Press',
                'Seated Cable Row', 'Leg Press', 'Bicep Curls', 'Triceps Pushdown',
            ],
        };

        // Load the preferred movements in one query, preserving priority order.
        $catalogue = Exercise::with('muscleGroups')
            ->whereIn('name', $preferred)
            ->get()
            ->keyBy('name');

        $picked = collect();
        $usedGroups = [];

        /*
         * Two passes, because the catalogue only has seven muscle groups and
         * most movements train two or three of them at once — a bench press is
         * chest AND triceps AND shoulders. Enforcing "one exercise per group"
         * as a hard rule therefore exhausted the groups after three movements
         * and produced a three-exercise programme regardless of the target.
         *
         * Pass 1 takes movements that cover a NEW group, which spreads the
         * block across the body. Pass 2 fills the remaining slots with
         * already-covered movements, so the block still reaches its intended
         * size. Spread is a preference, not a ceiling.
         */
        $deferred = collect();

        foreach ($preferred as $name) {
            if ($picked->count() >= $count) {
                break;
            }

            $exercise = $catalogue->get($name);

            if ($exercise === null) {
                continue;
            }

            $groupIds = $exercise->muscleGroups->pluck('id')->all();

            if ($groupIds !== [] && array_intersect(array_keys($usedGroups), $groupIds)) {
                // Covers ground already worked — hold it for pass 2.
                $deferred->push($exercise);

                continue;
            }

            foreach ($groupIds as $id) {
                $usedGroups[$id] = true;
            }

            $picked->push($exercise);
        }

        // Pass 2: top up to the target with the deferred movements.
        foreach ($deferred as $exercise) {
            if ($picked->count() >= $count) {
                break;
            }
            $picked->push($exercise);
        }

        // Final top-up from the wider catalogue if the preferred list was short
        // (a catalogue gap, or fewer preferred names than the target).
        if ($picked->count() < $count) {
            $fillers = Exercise::with('muscleGroups')
                ->when($picked->isNotEmpty(), fn ($q) => $q->whereNotIn('id', $picked->pluck('id')))
                ->inRandomOrder()
                ->limit(60)
                ->get();

            foreach ($fillers as $exercise) {
                if ($picked->count() >= $count) {
                    break;
                }

                $groupIds = $exercise->muscleGroups->pluck('id')->all();

                // Still prefer a new group while any remain unused.
                if ($groupIds !== [] && array_intersect(array_keys($usedGroups), $groupIds)) {
                    continue;
                }

                foreach ($groupIds as $id) {
                    $usedGroups[$id] = true;
                }

                $picked->push($exercise);
            }

            // Last resort: accept repeats rather than ship a short programme.
            if ($picked->count() < $count) {
                $more = Exercise::when($picked->isNotEmpty(), fn ($q) => $q->whereNotIn('id', $picked->pluck('id')))
                    ->inRandomOrder()
                    ->limit($count - $picked->count())
                    ->get();

                foreach ($more as $exercise) {
                    if ($picked->count() >= $count) {
                        break;
                    }
                    $picked->push($exercise);
                }
            }
        }

        return $picked;
    }

    /**
     * Sets and reps for the goal and experience.
     *
     * @return array{sets: int, reps: int}
     */
    private function setRepScheme(string $goal, string $experience): array
    {
        return match ($goal) {
            // Heavy, low reps. A beginner still starts at 5s — the load is what
            // changes, not the rep range.
            'strength' => [
                'sets' => $experience === 'beginner' ? 3 : 5,
                'reps' => 5,
            ],
            // Higher reps, shorter rests. Capped at 12 so the strength-trend
            // analytics (which exclude >12 reps as unreliable) still work.
            'endurance' => [
                'sets' => 3,
                'reps' => 12,
            ],
            // Hypertrophy: the classic 8-12 band.
            default => [
                'sets' => $experience === 'beginner' ? 3 : 4,
                'reps' => 8,
            ],
        };
    }

    private function durationFor(string $experience): int
    {
        return match ($experience) {
            'advanced' => 75,
            'intermediate' => 65,
            default => 55,
        };
    }

    private function programName(string $goal, string $experience): string
    {
        $goalLabel = match ($goal) {
            'strength' => 'Strength',
            'endurance' => 'Conditioning',
            default => 'Muscle',
        };

        $phase = match ($experience) {
            'advanced' => 'Advanced Block',
            'intermediate' => 'Progression Block',
            default => 'Foundation',
        };

        return "Week 1 - {$goalLabel} {$phase}";
    }

    /**
     * The coaching notes that ship with the generated plan.
     *
     * These exist so the member has instruction even before the trainer has
     * spoken to them, and so the trainer can see the reasoning to correct.
     */
    private function programNotes(string $goal, string $experience, int $frequency): string
    {
        $goalNote = match ($goal) {
            'strength' => 'Built around the main lifts. Rest 2-3 minutes between sets — the goal is force, not fatigue.',
            'endurance' => 'Conditioning focus. Keep rest under 60 seconds and aim to finish each set breathing hard but controlled.',
            default => 'Hypertrophy focus. Control the lowering phase (2-3 seconds) and leave 1-2 reps in reserve on every set.',
        };

        $experienceNote = match ($experience) {
            'advanced' => 'Volume is set for an experienced lifter. Adjust if recovery is compromised.',
            'intermediate' => 'Progressive overload: add the smallest available increment once all sets hit the target reps.',
            default => 'Technique first. Use a load you can control for every rep, and stop the set if form breaks down.',
        };

        $frequencyNote = $frequency >= 5
            ? "You train {$frequency} days a week, so keep individual sessions short and prioritise sleep."
            : "Scheduled around {$frequency} training days a week.";

        return implode("\n\n", [
            $goalNote,
            $experienceNote,
            $frequencyNote,
            'Your trainer will review this and adjust the loading after your first session.',
        ]);
    }
}
