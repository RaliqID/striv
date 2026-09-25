<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // SPA frontend handles auth redirects client-side. Never redirect
        // to a Laravel "login" route (does not exist) — API auth failures
        // must render JSON 401.
        $middleware->redirectGuestsTo(null);
        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureUserIsAdmin::class,
            'not_suspended' => \App\Http\Middleware\EnsureUserIsNotSuspended::class,
        ]);

        // Send hardening headers on every response, including auth failures
        // (a 401 without them is just as exploitable as a 200).
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        /*
         * Trusted reverse proxies.
         *
         * Required so the real client IP survives the proxy hop: without it
         * every request looks like 127.0.0.1, which collapses all callers into
         * one login-throttle bucket (an attacker could then lock out every
         * user) and makes the admin security log useless.
         *
         * Anything sent outside the trusted set is ignored, so this is safe
         * only while a trusted proxy is genuinely in front of the app. In
         * production, TRUSTED_PROXIES defaults to the private ranges that a
         * load balancer sits in rather than '*': with '*' anyone who can reach
         * the app directly could forge X-Forwarded-For and bypass IP-based
         * throttling entirely by claiming a new address per request.
         */
        $trustedProxies = env('TRUSTED_PROXIES');
        if ($trustedProxies === null || $trustedProxies === '') {
            // env() rather than app()->environment(): this closure runs while
            // the application is still being configured, before the container
            // can resolve 'env'.
            $trustedProxies = env('APP_ENV') === 'production'
                ? '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1'
                : '*';
        }

        $middleware->trustProxies(
            at: $trustedProxies === '*' ? '*' : array_map('trim', explode(',', $trustedProxies)),
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function ($request, $e) {
            return $request->is('api/*') || $request->expectsJson();
        });
    })->create();
