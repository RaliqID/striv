<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Baseline security headers on every API response.
 *
 * These are cheap, stateless, and close off whole classes of browser-side
 * attack. The API returns JSON only, so the content policy is deliberately
 * restrictive: nothing here should ever be interpreted as a document.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = [
            // Never let a browser guess that a JSON body is really HTML/JS.
            'X-Content-Type-Options' => 'nosniff',

            // The API is called by a separate origin; block framing outright
            // rather than leaving clickjacking to the frontend's own headers.
            'X-Frame-Options' => 'DENY',

            // Do not leak the app URL (which may contain a path) to third
            // parties on outbound links.
            'Referrer-Policy' => 'no-referrer',

            // Nothing in an API response should be a document, a frame, or a
            // plugin: default-src 'none' plus explicit denies.
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",

            // Deny access to device APIs the API has no business using.
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=()',
        ];

        // HSTS only over HTTPS: sending it on plain HTTP is meaningless and
        // would pin a local dev host to HTTPS, breaking it.
        if ($request->secure()) {
            $headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }

        foreach ($headers as $name => $value) {
            // Do not clobber a header the app set deliberately.
            if (! $response->headers->has($name)) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }
}
