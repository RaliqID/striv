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
    | Google Gemini, via its OpenAI-compatible shim.
    |
    | Gemini's native API uses a different request shape (contents/parts), but
    | Google exposes an OpenAI-compatible surface at /v1beta/openai, so the
    | generic OpenAICompatibleProvider talks to it with no bespoke adapter.
    |
    | The model is pinned to a stable Flash generation on purpose: `gemini-2.5-*`
    | and `gemini-3.5-flash` returned 404/503 against a live key, while the
    | 3.6/3.7/3.8-flash line responded reliably. It is also vision-capable,
    | which the coach's photo messages depend on.
    */
    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'base_uri' => env('GEMINI_BASE_URI', 'https://generativelanguage.googleapis.com/v1beta/openai'),
        'model' => env('GEMINI_MODEL', 'gemini-3.7-flash'),
    ],

    /*
    | WhatsApp reminder provider.
    |
    | The channel members in Indonesia actually read, so most reminders will
    | eventually go here. Supports the two common local providers, which differ
    | only in request shape.
    |
    | Left empty by default: the reminder system runs fully on email until a
    | token is supplied, and WhatsAppChannel::isConfigured() returns false so
    | nothing is attempted — and nothing is logged as a failure — in the
    | meantime.
    */
    'whatsapp' => [
        'provider' => env('WHATSAPP_PROVIDER'),
        'token' => env('WHATSAPP_TOKEN'),
        'api_url' => env('WHATSAPP_API_URL'),
    ],

    /*
    | DevStack (9router) — self-hosted, OpenAI-compatible routing gateway.
    |
    | -----------------------------------------------------------------------
    | WHAT IT IS
    | -----------------------------------------------------------------------
    | 9router runs locally and fans requests out to upstream providers, so
    | `base_uri` points at YOUR gateway (default port 20128), not a vendor host,
    | and `model` is whichever alias/combo you enabled in its dashboard. It
    | exposes the standard POST /chat/completions route, which is why it can be
    | reached by the same generic provider code as Gemini.
    |
    | -----------------------------------------------------------------------
    | WHAT IT IS FOR
    | -----------------------------------------------------------------------
    | It is the VISION FALLBACK. Gemini is the primary provider for photo
    | verification; this is what answers when Gemini is unavailable, so a
    | Google-wide 503 slows verification down instead of disabling it.
    |
    | It is also used as the primary provider for non-photo AI work (the training
    | assistant and insight generation), which is a different code path — see
    | AI_PROVIDER / AI_FALLBACK below.
    |
    | -----------------------------------------------------------------------
    | THE MODEL MUST BE VISION-CAPABLE — THIS IS NOT OPTIONAL
    | -----------------------------------------------------------------------
    | A text-only model does not fail loudly. It returns HTTP 200 and a polite
    | reply such as "No image attached.", which satisfies every check a caller
    | can make while verifying precisely nothing. The result is that every
    | member's photo silently becomes "unverified" and nobody notices.
    |
    | Measured directly against the running gateway, sending real images and
    | asking what colour/shape they are:
    |
    |   cbai/deepseek-v4.1-flash   "Blue" / "Circle" / "4"      CAN see  [IN USE]
    |   ag/gemini-3.8-flash        "Red"                        can see
    |   kr/claude-sonnet-4.5       "No image attached."         CANNOT see
    |
    | The three distinct images matter: a model that cannot see has no way to
    | answer "blue", then "circle", then "4" correctly by guessing.
    |
    | -----------------------------------------------------------------------
    | IF YOU CHANGE THIS MODEL
    | -----------------------------------------------------------------------
    | Re-run the test with an IMAGE. A text prompt proves nothing, because every
    | model — including the ones above that cannot see — will answer a text
    | prompt perfectly well. Send a picture of a known colour and ask for the
    | colour; if the reply is not that colour, the model cannot see and the
    | fallback is broken.
    */
    'devstack' => [
        'key' => env('DEVSTACK_API_KEY', 'local'),
        'base_uri' => env('DEVSTACK_BASE_URI', 'http://localhost:20128/v1'),
        'model' => env('DEVSTACK_MODEL', 'cbai/deepseek-v4.1-flash'),
    ],

    /*
    | AI provider selection.
    |
    | There are two independent chains here, because the two jobs have different
    | requirements and different failure costs.
    |
    | -----------------------------------------------------------------------
    | 1. TEXT CHAIN — the training assistant and insight generation
    | -----------------------------------------------------------------------
    | `provider` answers first, `fallback` is tried when it does not. Both are
    | reached through AiProviderFactory, so any OpenAI-compatible endpoint works.
    |
    | Defaults target the local gateway rather than a vendor, so a fresh clone
    | runs without external credentials. Override with AI_PROVIDER / AI_FALLBACK.
    |
    | A failure here is user-visible but recoverable: the member sees an error in
    | the chat panel and can retry. Nothing is lost.
    |
    | -----------------------------------------------------------------------
    | 2. VISION CHAIN — workout photo verification
    | -----------------------------------------------------------------------
    | `vision` names the primary vision provider.
    |
    | NOTE: unlike the text chain, the vision chain is NOT driven from here. Its
    | ordering lives in VisionClient (GEMINI_MODELS, then askDevStack), because
    | the fallback depends on per-model behaviour that a config string cannot
    | express — it retries a sibling Gemini model on a 503 but stops immediately
    | on a 429, since a rate limit applies to the whole API key rather than to one
    | model. `vision_fallback` is therefore declarative only; it documents the
    | intent, and changing it does NOT change behaviour. Edit VisionClient too.
    |
    | A failure here is different in kind from a text failure: a member has
    | finished a set and their photo cannot be checked. The set is still completed
    | and the photo is stored, but it is flagged `unverified` so a trainer reviews
    | it. Losing this chain does not break training, it degrades the evidence —
    | which is why it is worth having a fallback at all.
    */
    'ai' => [
        // Text chain
        'provider' => env('AI_PROVIDER', 'devstack'),
        'fallback' => env('AI_FALLBACK', 'groq'),

        // Vision chain — declarative; the real order is in VisionClient.
        'vision' => env('AI_VISION_PROVIDER', 'gemini'),
        'vision_fallback' => env('AI_VISION_FALLBACK', 'devstack'),
    ],

];
