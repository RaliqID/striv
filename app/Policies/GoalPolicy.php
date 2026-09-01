<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Goal;

class GoalPolicy
{
    public function view(User $user, Goal $goal)
    {
        return $user->id === $goal->user_id;
    }

    public function update(User $user, Goal $goal)
    {
        return $user->id === $goal->user_id;
    }

    public function delete(User $user, Goal $goal)
    {
        return $user->id === $goal->user_id;
    }
}