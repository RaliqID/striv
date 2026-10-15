<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the request's language.
 *
 * Precedence, highest first:
 *
 *   1. an explicit `X-Locale` header — lets the client switch language before
 *      the change has round-tripped through the profile save
 *   2. the signed-in user's stored preference — the choice follows them across
 *      devices, which is the point of storing it server-side
 *   3. `Accept-Language` — a sensible guess for an anonymous visitor
 *   4. the app default
 *
 * The resolved locale is also echoed back as `Content-Language` so a client
 * (or a cache) can tell which language actually produced the response, rather
 * than having to infer it.
 */
class SetLocale
{
    /** Locales the application actually ships translations for. */
    public const SUPPORTED = ['en', 'id'];

    public const DEFAULT = 'en';

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $this->resolve($request);

        App::setLocale($locale);

        $response = $next($request);
        $response->headers->set('Content-Language', $locale);

        return $response;
    }

    /** Decide which locale this request should render in. */
    private function resolve(Request $request): string
    {
        // 1. Explicit override from the client.
        $header = $request->header('X-Locale');
        if (is_string($header) && $this->supports($header)) {
            return $this->normalize($header);
        }

        // 2. The user's saved preference.
        $user = $request->user();
        if ($user !== null && is_string($user->locale) && $this->supports($user->locale)) {
            return $this->normalize($user->locale);
        }

        // 3. Accept-Language negotiation.
        $negotiated = $this->fromAcceptLanguage($request->header('Accept-Language'));
        if ($negotiated !== null) {
            return $negotiated;
        }

        // 4. Default.
        return self::DEFAULT;
    }

    /**
     * Pick the best supported locale from an Accept-Language header.
     *
     * Parses the q-values properly rather than taking the first entry: browsers
     * do not guarantee order, and `en;q=0.2, id;q=0.9` means Indonesian.
     */
    private function fromAcceptLanguage(?string $header): ?string
    {
        if (! is_string($header) || trim($header) === '') {
            return null;
        }

        $weighted = [];

        foreach (explode(',', $header) as $part) {
            $bits = explode(';', trim($part));
            $tag = strtolower(trim($bits[0]));
            if ($tag === '') {
                continue;
            }

            $q = 1.0;
            foreach (array_slice($bits, 1) as $param) {
                if (preg_match('/^\s*q\s*=\s*([0-9.]+)\s*$/i', $param, $m)) {
                    $q = (float) $m[1];
                }
            }

            // Trim a region suffix: "id-ID" and "en-GB" map to "id" and "en".
            $base = explode('-', $tag)[0];

            if ($this->supports($base)) {
                // Keep the highest q for each base tag.
                $weighted[$base] = max($weighted[$base] ?? 0.0, $q);
            }
        }

        if ($weighted === []) {
            return null;
        }

        arsort($weighted);

        return array_key_first($weighted);
    }

    private function supports(string $locale): bool
    {
        return in_array($this->normalize($locale), self::SUPPORTED, true);
    }

    private function normalize(string $locale): string
    {
        return strtolower(explode('-', str_replace('_', '-', $locale))[0]);
    }
}
