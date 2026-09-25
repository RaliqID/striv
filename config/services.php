<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'groq' => [
        'key' => env('GROQ_API_KEY'),
        'base_uri' => env('GROQ_BASE_URI', 'https://api.groq.com/openai/v1'),
        'model' => env('GROQ_MODEL', 'openai/gpt-oss-120b'),
    ],

    'xkiro' => [
        'key' => env('XKIRO_API_KEY'),
        'base_uri' => env('XKIRO_BASE_URI', 'https://api.xkiro.com/v1'),
        'model' => env('XKIRO_MODEL', 'minimax/minimax-m2.7-highspeed:free'),
    ],

    'bai' => [
        'key' => env('BAI_API_KEY'),
        'base_uri' => env('BAI_BASE_URI', 'https://api.b.ai/v1'),
        'model' => env('BAI_MODEL', 'glm-5.3-flash'),
    ],

    /*
    | DevStack (9router) — self-hosted, OpenAI-compatible routing gateway.
    |
    | 9router runs locally and fans requests out to upstream providers, so
    | `base_uri` points at YOUR gateway (default port 20128), not a vendor
    | host, and `model` is whichever alias/combo you enabled in its dashboard.
    | It exposes the standard POST /chat/completions route the generic
    | provider already speaks.
    */
    'devstack' => [
        'key' => env('DEVSTACK_API_KEY', 'local'),
        'base_uri' => env('DEVSTACK_BASE_URI', 'http://localhost:20128/v1'),
        'model' => env('DEVSTACK_MODEL', 'gpt-4o-mini'),
    ],

    // Primary AI provider + fallback chain (tried in order)
    'ai' => [
        'provider' => env('AI_PROVIDER', 'devstack'),
        'fallback' => env('AI_FALLBACK', 'groq'),
        'vision' => env('AI_VISION_PROVIDER', 'devstack'),
    ],

];
