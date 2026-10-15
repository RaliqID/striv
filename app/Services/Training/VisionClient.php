<?php

namespace App\Services\Training;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sends an image to a vision model, trying several endpoints until one answers.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CLASS EXISTS
 * ---------------------------------------------------------------------------
 * A member cannot complete a set without photographic evidence, and that photo
 * has to be checked against the exercise being claimed. The check is done by a
 * vision model, because verifying "is this a bench press" needs an actual look
 * at the picture — no amount of metadata, file size or EXIF data can tell a
 * bench press from a bicep curl.
 *
 * A single provider would be a single point of failure. The failure mode is
 * worse than a plain error, too: if the model cannot be reached, the honest
 * outcome is "we could not check", and the member's set is held as unverified.
 * They did the work; the infrastructure let them down. So instead of trusting
 * one endpoint, this walks a short chain.
 *
 * ---------------------------------------------------------------------------
 * THE CHAIN, IN ORDER
 * ---------------------------------------------------------------------------
 * 1. GEMINI FLASH (primary)
 *    Google's OpenAI-compatible endpoint, using the two Flash models measured to
 *    answer reliably (see GEMINI_MODELS below for the numbers). Flash is
 *    deliberately chosen over a Pro or reasoning model: the task is a short
 *    classification — "does this photo match this exercise" — and paying for
 *    reasoning tokens to answer it would be waste.
 *
 * 2. DEVSTACK / 9router (fallback)
 *    A self-hosted gateway running locally on port 20128, which fans requests out
 *    to whichever upstream providers are configured in its dashboard. It is
 *    reached ONLY when every Gemini model has failed.
 *
 *    CRITICAL: the model this gateway is pointed at MUST be vision-capable.
 *    A text-only model does not error — it returns HTTP 200 and a polite reply
 *    such as "No image attached.", which passes every check a caller could make
 *    while silently failing to verify anything. That is the worst kind of bug:
 *    a failure that looks like success.
 *
 *    The routing model is therefore verified by TESTING, not by name. Probed
 *    against the running gateway with distinct images and "what colour/shape"
 *    questions:
 *
 *      cbai/deepseek-v4.1-flash   "Blue" / "Circle" / "4"   -> CAN see  [IN USE]
 *      ag/gemini-3.8-flash        "Red"                     -> can see
 *      kr/claude-sonnet-4.5       "No image attached."      -> CANNOT see
 *
 *    The third one is why this note is here. It returns 200, so nothing looks
 *    broken, and verification quietly degrades to "unverified" for every member.
 *    If you repoint DEVSTACK_MODEL, re-run that test — with an IMAGE, never with
 *    a text prompt, which any model can answer.
 *
 * ---------------------------------------------------------------------------
 * WHAT HAPPENS WHEN EVERYTHING FAILS
 * ---------------------------------------------------------------------------
 * ask() returns null. The caller (WorkoutPhotoVerifier) records the photo as
 * `unverified` rather than rejecting it: an outage is not the member's fault,
 * the set is still allowed, and the trainer's review queue surfaces the photo so
 * a human can check it. The claim is recorded as UNPROVEN, never as proven.
 *
 * See config/services.php for the provider keys and model names, and
 * WorkoutPhotoVerifier for how a reply becomes a verdict.
 */
class VisionClient
{
    /**
     * Candidate models, tried in order.
     *
     * Kept SHORT on purpose. An earlier version listed four Gemini models, on
     * the theory that a 503 for one would be answered by a sibling — but a 429
     * (rate limit) is per API KEY, not per model, so four attempts burned four
     * units of quota to collect four identical refusals.
     *
     * This list exists because availability genuinely varies between siblings:
     * observing the API directly, 3.6 and 3.8 returned 503 while 3.5 answered
     * the same request seconds later. So a couple of options catch a real
     * per-model overload without wasting quota on a per-key limit.
     *
     * The membership is not guesswork. Measured against a live key, sending the
     * same image request repeatedly:
     *
     *   gemini-3.6-flash     9/9 answered
     *   gemini-3.5-flash     9/9 answered
     *   gemini-3.8-flash     2/5   (rest 503 "high demand")
     *   gemini-flash-latest  2/5   (rest 503, once 429)
     *
     * So 3.6 and 3.5 are the two that actually answer, and 3.8 is dropped: it
     * mostly 503s, and every 503 it returns is a wasted round-trip before the
     * request reaches a sibling that can answer. A member's verification was
     * previously lost when the one reliable-ordered model was spiking and the
     * next candidate was one of the flaky ones. The order below puts the two
     * proven-good models first so the fallback is a sibling that works, not
     * another gamble.
     *
     * (3.8 appears in the DevStack table in the class docblock because the local
     * gateway exposes it under a different route, `ag/gemini-3.8-flash`. That is
     * a separate endpoint from the direct Google one above, which is why a model
     * can be unreliable here and fine there.)
     */
    private const GEMINI_MODELS = [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
    ];

    private const TIMEOUT_SECONDS = 45;

    /**
     * Status of the most recent attempt, so the caller can tell a rate limit
     * from an overload. 429 is per API key, so retrying siblings on it burns
     * quota for the same refusal.
     */
    private ?int $lastStatus = null;

    /**
     * Ask a vision model about an image.
     *
     * @param  string  $prompt  Instruction text to precede the image
     * @param  string  $base64  Raw base64 image data, no data: prefix
     * @param  string  $mime    e.g. image/jpeg
     * @return string|null      The model's reply, or null when everything failed
     */
    public function ask(string $prompt, string $base64, string $mime): ?string
    {
        $payload = $this->payload($prompt, $base64, $mime);

        $geminiKey = config('services.gemini.key');
        $geminiBase = rtrim((string) config('services.gemini.base_uri'), '/');

        if (filled($geminiKey) && $geminiBase !== '') {
            foreach (self::GEMINI_MODELS as $model) {
                $this->lastStatus = null;

                $reply = $this->post($geminiBase.'/chat/completions', $geminiKey, $model, $payload);

                if ($reply !== null) {
                    return $reply;
                }

                /*
                 * Stop on a rate limit.
                 *
                 * 429 is applied to the API key, not the model, so trying the
                 * sibling would spend another unit of quota to receive the same
                 * refusal. Bailing out immediately keeps the remaining quota for
                 * the next member's request.
                 */
                if ($this->lastStatus === 429) {
                    Log::warning('VisionClient: rate limited, not trying siblings', [
                        'model' => $model,
                    ]);

                    break;
                }
            }
        } else {
            Log::warning('VisionClient: Gemini not configured, trying DevStack only');
        }

        return $this->askDevStack($payload);
    }

    /**
     * Try the self-hosted 9router gateway.
     *
     * This is the last resort: reached only after every Gemini model has failed.
     * It is what turns "the provider is down" into "the photo still got checked",
     * so its configured model has to be vision-capable — see the class docblock
     * for the measured evidence and how to re-verify it.
     *
     * The token is optional on purpose. A locally-running gateway commonly has no
     * auth configured, and sending an empty `Authorization: Bearer` header is
     * rejected outright by some proxies while omitting the header entirely is
     * accepted. So the header is only attached when a key actually exists.
     */
    private function askDevStack(array $payload): ?string
    {
        $base = rtrim((string) config('services.devstack.base_uri'), '/');

        /*
         * Fall back to the same vision-capable model on both sides of the `?:`.
         *
         * The previous default here was 'gpt-4o-mini', which this gateway does
         * not necessarily serve — a missing model is a 404, so the fallback
         * would fail for a reason that has nothing to do with the photo. Using
         * the known-good model as its own default means an unset env var still
         * yields a working request rather than a confusing one.
         */
        $model = (string) (config('services.devstack.model') ?: 'cbai/deepseek-v4.1-flash');
        $key = config('services.devstack.key');

        if ($base === '') {
            return null;
        }

        return $this->post($base.'/chat/completions', $key ?: null, $model, $payload);
    }

    /**
     * One attempt against one endpoint and model.
     *
     * Returns null on ANY failure, so the caller can move to the next candidate.
     * Failures are recorded rather than thrown: a member's photo must still be
     * saved and their set still completed even when no model can be reached. The
     * alternative — propagating an exception — would turn an AI outage into a
     * blocked workout.
     *
     * `lastStatus` is kept so a 429 (rate limit) can be told apart from a 503
     * (overload). That distinction drives the caller's decision: a 429 is per API
     * key, so retrying a sibling model would burn more quota for the same
     * refusal, whereas a 503 is per model and a sibling may well answer.
     */
    private function post(string $url, ?string $key, string $model, array $payload): ?string
    {
        try {
            $request = Http::timeout(self::TIMEOUT_SECONDS)->acceptJson();

            if (filled($key)) {
                $request = $request->withToken($key);
            }

            $response = $request->post($url, $payload + ['model' => $model]);

            if (! $response->successful()) {
                $this->lastStatus = $response->status();

                Log::info('VisionClient: rejected', [
                    'model' => $model,
                    'url' => $url,
                    'status' => $response->status(),
                ]);

                return null;
            }

            $this->lastStatus = $response->status();

            $content = $response->json('choices.0.message.content');

            if (! is_string($content) || trim($content) === '') {
                Log::info('VisionClient: empty content', ['model' => $model]);

                return null;
            }

            return $content;
        } catch (\Throwable $e) {
            Log::info('VisionClient: threw', [
                'model' => $model,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $prompt, string $base64, string $mime): array
    {
        /*
         * Normalise the image to plain base64 before it is interpolated into
         * JSON.
         *
         * Two things can arrive here that look fine but are not:
         *
         *   - a data: URL ("data:image/jpeg;base64,AAAA"), which is what
         *     canvas.toDataURL() produces and the client sends verbatim
         *   - raw image BYTES that were never base64 at all
         *
         * The second is the dangerous one. Interpolating binary into a JSON
         * string makes json_encode fail outright with "Malformed UTF-8
         * characters" — and because that happens while BUILDING the request,
         * every model in the chain fails identically, the fallback never gets a
         * chance, and the caller reports it as a provider outage. That reads as
         * "the AI is down" when the real fault is the payload, which is exactly
         * the wrong conclusion to hand a maintainer.
         *
         * Stripping the prefix and re-encoding anything that is not valid base64
         * means a malformed caller produces a wrong-but-sendable request rather
         * than a silent, total failure.
         */
        $base64 = $this->normaliseBase64($base64);

        /*
         * The prompt gets the same treatment, for the same reason.
         *
         * It is assembled from data — the exercise name, mostly — so a name
         * stored with a broken byte sequence would make json_encode fail and
         * take the whole provider chain down with it. Substituting the invalid
         * sequences keeps the request sendable and the verification meaningful;
         * the alternative is reporting a provider outage that is not happening.
         */
        $prompt = $this->normaliseText($prompt);

        return [
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'You verify training photos. Answer with JSON only.',
                ],
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        [
                            'type' => 'image_url',
                            'image_url' => ['url' => "data:{$mime};base64,{$base64}"],
                        ],
                    ],
                ],
            ],
            'max_tokens' => 900,
            'temperature' => 0.1,
        ];
    }

    /**
     * Reduce whatever was handed in to plain base64.
     *
     * A data: URL is stripped. Anything that is not valid base64 is assumed to
     * be raw binary and encoded, which is the only reading that produces a
     * usable request — and is far better than letting json_encode fail.
     */
    private function normaliseBase64(string $image): string
    {
        // Any data: URL, not just image/* — the prefix carries no useful data
        // once we already know the mime separately.
        if (str_starts_with($image, 'data:')) {
            $comma = strpos($image, ',');

            if ($comma !== false) {
                $image = substr($image, $comma + 1);
            }
        }

        // Whitespace is legal in a data URL but not in a JSON-safe base64 blob.
        $image = preg_replace('/\s+/', '', $image) ?? $image;

        // Valid base64: right alphabet and, crucially, it decodes.
        if ($image !== '' && base64_decode($image, true) !== false) {
            return $image;
        }

        // Not base64 — treat it as raw bytes.
        return base64_encode($image);
    }

    /**
     * Make a string safe to embed in JSON.
     *
     * mb_convert_encoding with the substitute character replaces any invalid
     * byte sequence with U+FFFD instead of failing. mb_check_encoding is tried
     * first so the common case (already valid) costs nothing and returns the
     * string untouched.
     */
    private function normaliseText(string $text): string
    {
        if (mb_check_encoding($text, 'UTF-8')) {
            return $text;
        }

        return mb_convert_encoding($text, 'UTF-8', 'UTF-8');
    }
}
