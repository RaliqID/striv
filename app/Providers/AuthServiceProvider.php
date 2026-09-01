<?php

namespace App\Providers;

use App\Models\WorkoutSession;
use App\Policies\WorkoutSessionPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        WorkoutSession::class => WorkoutSessionPolicy::class,
    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}