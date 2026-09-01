<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WorkoutSession;

class WorkoutSessionPolicy
{
    public function view(User $user, WorkoutSession $workoutSession): bool
    {
        return $user->id === $workoutSession->user_id;
    }

    public function update(User $user, WorkoutSession $workoutSession): bool
    {
        return $user->id === $workoutSession->user_id;
    }

    public function delete(User $user, WorkoutSession $workoutSession): bool
    {
        return $user->id === $workoutSession->user_id;
    }
}