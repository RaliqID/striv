<?php

namespace App\Providers;

use App\Services\AI\InsightContextBuilder;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // AI providers are built per-request by AIInsightService::makeProvider()
        // from config('services.ai') — no container binding needed.
        $this->app->singleton(InsightContextBuilder::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
