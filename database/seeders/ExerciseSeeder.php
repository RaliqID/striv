<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Exercise;
use App\Models\MuscleGroup;

class ExerciseSeeder extends Seeder
{
    public function run(): void
    {
        $exercises = [
            // ===== CHEST =====
            ['name' => 'Barbell Bench Press', 'slug' => 'barbell-bench-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Chest', 'Triceps', 'Shoulders']],
            ['name' => 'Incline Barbell Press', 'slug' => 'incline-barbell-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Chest', 'Shoulders', 'Triceps']],
            ['name' => 'Decline Barbell Press', 'slug' => 'decline-barbell-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Chest', 'Triceps']],
            ['name' => 'Dumbbell Bench Press', 'slug' => 'dumbbell-bench-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Chest', 'Triceps', 'Shoulders']],
            ['name' => 'Incline Dumbbell Press', 'slug' => 'incline-dumbbell-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Chest', 'Shoulders', 'Triceps']],
            ['name' => 'Decline Dumbbell Press', 'slug' => 'decline-dumbbell-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Chest', 'Triceps']],
            ['name' => 'Dumbbell Flyes', 'slug' => 'dumbbell-flyes', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Chest']],
            ['name' => 'Incline Dumbbell Flyes', 'slug' => 'incline-dumbbell-flyes', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Chest']],
            ['name' => 'Cable Crossover', 'slug' => 'cable-crossover', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Chest']],
            ['name' => 'Cable Flyes', 'slug' => 'cable-flyes', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Chest']],
            ['name' => 'Chest Press Machine', 'slug' => 'chest-press-machine', 'category' => 'Machine', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Chest', 'Triceps']],
            ['name' => 'Pec Deck Machine', 'slug' => 'pec-deck-machine', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Chest']],
            ['name' => 'Chest Dips', 'slug' => 'chest-dips', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Chest', 'Triceps', 'Shoulders']],
            ['name' => 'Push-ups', 'slug' => 'push-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Chest', 'Triceps', 'Shoulders']],
            ['name' => 'Incline Push-ups', 'slug' => 'incline-push-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Chest', 'Shoulders']],
            ['name' => 'Decline Push-ups', 'slug' => 'decline-push-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Chest', 'Triceps', 'Shoulders']],

            // ===== BACK =====
            ['name' => 'Barbell Row', 'slug' => 'barbell-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Pendlay Row', 'slug' => 'pendlay-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'T-Bar Row', 'slug' => 't-bar-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Dumbbell Row', 'slug' => 'dumbbell-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Seated Cable Row', 'slug' => 'seated-cable-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Single-Arm Cable Row', 'slug' => 'single-arm-cable-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Close-Grip Lat Pulldown', 'slug' => 'close-grip-lat-pulldown', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Wide-Grip Lat Pulldown', 'slug' => 'wide-grip-lat-pulldown', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Straight-Arm Pulldown', 'slug' => 'straight-arm-pulldown', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back']],
            ['name' => 'Pull-ups', 'slug' => 'pull-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Chin-ups', 'slug' => 'chin-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Neutral-Grip Pull-ups', 'slug' => 'neutral-grip-pull-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Back', 'Biceps']],
            ['name' => 'Deadlift', 'slug' => 'deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Legs', 'Core']],
            ['name' => 'Sumo Deadlift', 'slug' => 'sumo-deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Legs', 'Core']],
            ['name' => 'Trap Bar Deadlift', 'slug' => 'trap-bar-deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Legs']],
            ['name' => 'Rack Pull', 'slug' => 'rack-pull', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Legs']],
            ['name' => 'Barbell Shrug', 'slug' => 'barbell-shrug', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Shoulders']],
            ['name' => 'Dumbbell Shrug', 'slug' => 'dumbbell-shrug', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Back', 'Shoulders']],
            ['name' => 'Face Pulls', 'slug' => 'face-pulls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Shoulders', 'Back']],
            ['name' => 'Straight-Arm Pullover', 'slug' => 'straight-arm-pullover', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Back']],
            ['name' => 'Dumbbell Pullover', 'slug' => 'dumbbell-pullover', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Back', 'Chest']],
            ['name' => 'Good Morning', 'slug' => 'good-morning', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Back', 'Legs']],
            ['name' => 'Back Extension', 'slug' => 'back-extension', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Back', 'Core']],

            // ===== SHOULDERS =====
            ['name' => 'Overhead Press', 'slug' => 'overhead-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Shoulders', 'Triceps']],
            ['name' => 'Seated Overhead Press', 'slug' => 'seated-overhead-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Shoulders', 'Triceps']],
            ['name' => 'Standing Military Press', 'slug' => 'standing-military-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Shoulders', 'Triceps', 'Core']],
            ['name' => 'Dumbbell Shoulder Press', 'slug' => 'dumbbell-shoulder-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders', 'Triceps']],
            ['name' => 'Arnold Press', 'slug' => 'arnold-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders', 'Triceps']],
            ['name' => 'Machine Shoulder Press', 'slug' => 'machine-shoulder-press', 'category' => 'Machine', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Shoulders', 'Triceps']],
            ['name' => 'Lateral Raises', 'slug' => 'lateral-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders']],
            ['name' => 'Cable Lateral Raises', 'slug' => 'cable-lateral-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Shoulders']],
            ['name' => 'Machine Lateral Raises', 'slug' => 'machine-lateral-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Shoulders']],
            ['name' => 'Front Raises', 'slug' => 'front-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders']],
            ['name' => 'Cable Front Raises', 'slug' => 'cable-front-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Shoulders']],
            ['name' => 'Rear Delt Flyes', 'slug' => 'rear-delt-flyes', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders', 'Back']],
            ['name' => 'Reverse Pec Deck', 'slug' => 'reverse-pec-deck', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Shoulders']],
            ['name' => 'Barbell Upright Row', 'slug' => 'barbell-upright-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Shoulders', 'Back', 'Biceps']],
            ['name' => 'Dumbbell Upright Row', 'slug' => 'dumbbell-upright-row', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders', 'Back']],
            ['name' => 'Dumbbell Snatch', 'slug' => 'dumbbell-snatch', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Shoulders', 'Legs', 'Back']],

            // ===== BICEPS =====
            ['name' => 'Bicep Curls', 'slug' => 'bicep-curls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Biceps']],
            ['name' => 'Barbell Curl', 'slug' => 'barbell-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Biceps']],
            ['name' => 'EZ Bar Curl', 'slug' => 'ez-bar-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'EZ Bar', 'muscles' => ['Biceps']],
            ['name' => 'Hammer Curls', 'slug' => 'hammer-curls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Biceps']],
            ['name' => 'Preacher Curl', 'slug' => 'preacher-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'EZ Bar', 'muscles' => ['Biceps']],
            ['name' => 'Incline Dumbbell Curl', 'slug' => 'incline-dumbbell-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Biceps']],
            ['name' => 'Concentration Curl', 'slug' => 'concentration-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Biceps']],
            ['name' => 'Cable Curl', 'slug' => 'cable-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Biceps']],
            ['name' => 'Hammer Cable Curl', 'slug' => 'hammer-cable-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Biceps']],
            ['name' => 'Drag Curl', 'slug' => 'drag-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Biceps']],
            ['name' => 'Machine Preacher Curl', 'slug' => 'machine-preacher-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Biceps']],
            ['name' => 'Machine Bicep Curl', 'slug' => 'machine-bicep-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Biceps']],

            // ===== TRICEPS =====
            ['name' => 'Triceps Pushdown', 'slug' => 'triceps-pushdown', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Triceps']],
            ['name' => 'Rope Triceps Pushdown', 'slug' => 'rope-triceps-pushdown', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Triceps']],
            ['name' => 'Bar Triceps Pushdown', 'slug' => 'bar-triceps-pushdown', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Triceps']],
            ['name' => 'Skull Crushers', 'slug' => 'skull-crushers', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Triceps']],
            ['name' => 'EZ Bar Skull Crushers', 'slug' => 'ez-bar-skull-crushers', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'EZ Bar', 'muscles' => ['Triceps']],
            ['name' => 'Dumbbell Skull Crushers', 'slug' => 'dumbbell-skull-crushers', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Triceps']],
            ['name' => 'Overhead Cable Extension', 'slug' => 'overhead-cable-extension', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Triceps']],
            ['name' => 'Overhead Dumbbell Extension', 'slug' => 'overhead-dumbbell-extension', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Triceps']],
            ['name' => 'Triceps Kickbacks', 'slug' => 'triceps-kickbacks', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Triceps']],
            ['name' => 'Close-Grip Bench Press', 'slug' => 'close-grip-bench-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Triceps', 'Chest']],
            ['name' => 'Diamond Push-ups', 'slug' => 'diamond-push-ups', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Triceps', 'Chest']],
            ['name' => 'Bench Dips', 'slug' => 'bench-dips', 'category' => 'Bodyweight', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Triceps', 'Chest']],

            // ===== LEGS =====
            ['name' => 'Squat', 'slug' => 'squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs', 'Core']],
            ['name' => 'High-Bar Back Squat', 'slug' => 'high-bar-back-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs', 'Core']],
            ['name' => 'Front Squat', 'slug' => 'front-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs', 'Core']],
            ['name' => 'Goblet Squat', 'slug' => 'goblet-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Kettlebell', 'muscles' => ['Legs', 'Core']],
            ['name' => 'Hack Squat', 'slug' => 'hack-squat', 'category' => 'Machine', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Box Squat', 'slug' => 'box-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs']],
            ['name' => 'Pause Squat', 'slug' => 'pause-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs']],
            ['name' => 'Leg Press', 'slug' => 'leg-press', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Walking Lunge', 'slug' => 'walking-lunge', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Legs']],
            ['name' => 'Reverse Lunge', 'slug' => 'reverse-lunge', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Legs']],
            ['name' => 'Bulgarian Split Squat', 'slug' => 'bulgarian-split-squat', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Legs']],
            ['name' => 'Dumbbell Step-Up', 'slug' => 'dumbbell-step-up', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Legs']],
            ['name' => 'Romanian Deadlift', 'slug' => 'romanian-deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Legs', 'Back']],
            ['name' => 'Dumbbell Romanian Deadlift', 'slug' => 'dumbbell-romanian-deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Legs', 'Back']],
            ['name' => 'Single-Leg Romanian Deadlift', 'slug' => 'single-leg-romanian-deadlift', 'category' => 'Strength', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Legs', 'Core']],
            ['name' => 'Leg Extension', 'slug' => 'leg-extension', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Leg Curl', 'slug' => 'leg-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Seated Leg Curl', 'slug' => 'seated-leg-curl', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Hip Thrust', 'slug' => 'hip-thrust', 'category' => 'Strength', 'movement_pattern' => 'Push', 'equipment' => 'Barbell', 'muscles' => ['Legs']],
            ['name' => 'Glute Bridge', 'slug' => 'glute-bridge', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Legs']],
            ['name' => 'Calf Raises', 'slug' => 'calf-raises', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Bodyweight', 'muscles' => ['Legs']],
            ['name' => 'Standing Calf Raise', 'slug' => 'standing-calf-raise', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Seated Calf Raise', 'slug' => 'seated-calf-raise', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Donkey Calf Raise', 'slug' => 'donkey-calf-raise', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Single-Leg Calf Raise', 'slug' => 'single-leg-calf-raise', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Dumbbell', 'muscles' => ['Legs']],
            ['name' => 'Hip Abduction Machine', 'slug' => 'hip-abduction-machine', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Legs']],
            ['name' => 'Hip Adduction Machine', 'slug' => 'hip-adduction-machine', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Machine', 'muscles' => ['Legs']],

            // ===== CORE =====
            ['name' => 'Planks', 'slug' => 'planks', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Side Plank', 'slug' => 'side-plank', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Hanging Leg Raises', 'slug' => 'hanging-leg-raises', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Cable Crunch', 'slug' => 'cable-crunch', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Cable', 'muscles' => ['Core']],
            ['name' => 'Ab Wheel Rollout', 'slug' => 'ab-wheel-rollout', 'category' => 'Isolation', 'movement_pattern' => 'Push', 'equipment' => 'Machine', 'muscles' => ['Core']],
            ['name' => 'Dead Bug', 'slug' => 'dead-bug', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Bird Dog', 'slug' => 'bird-dog', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Pallof Press', 'slug' => 'pallof-press', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Cable', 'muscles' => ['Core']],
            ['name' => 'Toes-to-Bar', 'slug' => 'toes-to-bar', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Woodchopper', 'slug' => 'woodchopper', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Cable', 'muscles' => ['Core']],
            ['name' => 'Crunches', 'slug' => 'crunches', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Russian Twists', 'slug' => 'russian-twists', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Leg Raises', 'slug' => 'leg-raises', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Hollow Hold', 'slug' => 'hollow-hold', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Bodyweight', 'muscles' => ['Core']],
            ['name' => 'Nordic Curl', 'slug' => 'nordic-curl', 'category' => 'Bodyweight', 'movement_pattern' => 'Pull', 'equipment' => 'Bodyweight', 'muscles' => ['Legs', 'Core']],
            ['name' => 'Hyperextensions', 'slug' => 'hyperextensions', 'category' => 'Isolation', 'movement_pattern' => 'Static', 'equipment' => 'Machine', 'muscles' => ['Back', 'Core']],

            // ===== FOREARMS =====
            ['name' => 'Wrist Curls', 'slug' => 'wrist-curls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Dumbbell', 'muscles' => ['Biceps']],
            ['name' => 'Barbell Wrist Curls', 'slug' => 'barbell-wrist-curls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'Barbell', 'muscles' => ['Biceps']],
            ['name' => 'Reverse Curls', 'slug' => 'reverse-curls', 'category' => 'Isolation', 'movement_pattern' => 'Pull', 'equipment' => 'EZ Bar', 'muscles' => ['Biceps']],
            ['name' => "Farmer's Carry", 'slug' => "farmers-carry", 'category' => 'Strength', 'movement_pattern' => 'Static', 'equipment' => 'Dumbbell', 'muscles' => ['Core', 'Biceps']],
        ];

        $cache = [];
        foreach ($exercises as $ex) {
            $exercise = Exercise::firstOrCreate(
                ['slug' => $ex['slug']],
                [
                    'name' => $ex['name'],
                    'category' => $ex['category'],
                    'movement_pattern' => $ex['movement_pattern'],
                    'equipment' => $ex['equipment'],
                ]
            );

            $muscleIds = [];
            foreach ($ex['muscles'] as $muscleName) {
                if (!array_key_exists($muscleName, $cache)) {
                    $muscle = MuscleGroup::where('name', $muscleName)->first();
                    $cache[$muscleName] = $muscle?->id;
                }
                if ($cache[$muscleName]) {
                    $muscleIds[$cache[$muscleName]] = ['is_primary' => true];
                }
            }

            $exercise->muscleGroups()->syncWithoutDetaching($muscleIds);
        }
    }
}
