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

    // Primary AI provider + fallback chain (tried in order)
    'ai' => [
        'provider' => env('AI_PROVIDER', 'xkiro'),
        'fallback' => env('AI_FALLBACK', 'groq'),
    ],

];
