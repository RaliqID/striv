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

        /*
         * Trust the local reverse proxies that sit in front of this app.
         *
         * Requests reach Laravel through the Next.js dev server (and, when
         * sharing, through the tunnel in front of it), so without this every
         * request appears to come from 127.0.0.1. That would collapse all
         * callers into a single login-throttle bucket — one attacker could lock
         * out every user — and would make the admin security log useless.
         *
         * Everything is trusted only because this app is never exposed directly:
         * it listens on loopback and is always reached through a local proxy.
         */
        $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_FOR
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT
            | Request::HEADER_X_FORWARDED_PROTO);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function ($request, $e) {
            return $request->is('api/*') || $request->expectsJson();
        });
    })->create();
