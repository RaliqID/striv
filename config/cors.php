<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    /*
    | Origins allowed to call the API from a browser.
    |
    | Comma-separated CORS_ALLOWED_ORIGINS. Defaults to the local dev frontend
    | rather than '*' so the permissive setting has to be chosen explicitly.
    | A wildcard default is dangerous with token auth: any website could call
    | the API using a signed-in user's credentials. ProductionSafetyProvider
    | refuses to boot if a wildcard reaches production.
    */
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000'))
    ))),

    'allowed_origins_patterns' => [],

    /*
    | Explicit header allowlist. '*' would permit any custom header, which
    | widens the surface for no benefit — the API only ever reads these.
    */
    'allowed_headers' => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],

    // Let the browser cache preflights, halving the request count for mutating calls.
    'exposed_headers' => [],

    'max_age' => 86400,

    // Bearer tokens are sent in a header, not a cookie, so credentialed
    // cross-origin requests are neither needed nor enabled.
    'supports_credentials' => false,

];
