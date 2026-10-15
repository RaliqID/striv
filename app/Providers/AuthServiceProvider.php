<?php

namespace App\Providers;

use App\Models\TrainerAssignment;
use App\Models\WorkoutSession;
use App\Policies\TrainerAssignmentPolicy;
use App\Policies\WorkoutSessionPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        WorkoutSession::class => WorkoutSessionPolicy::class,
        TrainerAssignment::class => TrainerAssignmentPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();

        /*
         * "Does this trainer coach this member?"
         *
         * Expressed as a gate rather than a policy method so the check reads as
         * a question about two users, with no model binding to fake at the call
         * site. Every client-scoped trainer endpoint funnels through here, so
         * the privacy rule lives in exactly one place.
         */
        Gate::define('coaches', [TrainerAssignmentPolicy::class, 'coaches']);
    }
}
