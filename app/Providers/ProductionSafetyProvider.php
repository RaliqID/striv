<?php

namespace App\Providers;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;
use RuntimeException;

/**
 * Refuses to run in production with settings that leak data or expose the app.
 *
 * Every check here guards a failure mode that is silent and severe: debug mode
 * renders a full stack trace (with environment values) to the public on any
 * exception; a wildcard CORS origin lets any site call the API with a user's
 * credentials; a blank APP_KEY breaks encryption and session integrity.
 *
 * These are asserted at boot rather than documented, because a checklist that
 * depends on someone remembering is not a control. Failing loudly on deploy is
 * strictly better than leaking secrets to whoever triggers the next 500.
 */
class ProductionSafetyProvider extends ServiceProvider
{
    public function boot(): void
    {
        if (! $this->app->environment('production')) {
            return;
        }

        $this->assertDebugIsOff();
        $this->assertAppKeyIsSet();
        $this->assertCorsIsLockedDown();
        $this->assertHttpUrlIsHttps();
    }

    private function assertDebugIsOff(): void
    {
        if (config('app.debug')) {
            $this->fail(
                'APP_DEBUG is enabled in production. Any exception would render '
                .'a stack trace — including environment values — to the public.'
            );
        }
    }

    private function assertAppKeyIsSet(): void
    {
        if (blank(config('app.key'))) {
            $this->fail('APP_KEY is not set. Encryption and signed URLs cannot be trusted.');
        }
    }

    /**
     * A wildcard origin with token auth lets any website call the API on behalf
     * of a signed-in user.
     */
    private function assertCorsIsLockedDown(): void
    {
        $origins = (array) config('cors.allowed_origins', []);

        if (in_array('*', $origins, true)) {
            $this->fail(
                'CORS_ALLOWED_ORIGINS is not set, so it fell back to "*" (any site). '
                .'Set it to your frontend origin(s).'
            );
        }
    }

    /**
     * A plain-HTTP API in production sends bearer tokens in clear text.
     */
    private function assertHttpUrlIsHttps(): void
    {
        $url = (string) config('app.url');

        if ($url !== '' && str_starts_with($url, 'http://') && ! str_contains($url, 'localhost')) {
            $this->fail(
                "APP_URL is not HTTPS ({$url}). Tokens and passwords would travel in clear text."
            );
        }
    }

    private function fail(string $message): never
    {
        // Log as well as throw: if a deployment tooling swallows the exception,
        // the reason still lands somewhere the operator will see it.
        Log::critical('Unsafe production configuration: '.$message);

        throw new RuntimeException('Unsafe production configuration. '.$message);
    }
}
