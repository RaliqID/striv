<?php

namespace App\Providers;

use App\Services\AI\AIProviderInterface;
use App\Services\AI\GroqProvider;
use App\Services\AI\InsightContextBuilder;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(AIProviderInterface::class, function ($app) {
            return new GroqProvider();
        });

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
