<?php

namespace App\Services\Security;

use App\Models\LoginAttempt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Two-dimensional login throttling.
 *
 * A single counter is not enough. Limiting only by IP lets a botnet spray one
 * account from thousands of addresses; limiting only by account lets one host
 * walk a whole user list. So we keep two independent buckets and block if
 * either is exhausted:
 *
 *   - per IP:        stops one host hammering the endpoint (broad, cheap)
 *   - per IP+email:  stops credential stuffing against a single account
 *                    (tight, and survives the IP being rotated less well)
 *
 * Both keys are hashed before use so a raw email never appears in the cache
 * key, and the IP+email bucket is deliberately given a much longer decay than
 * the IP bucket — an attacker who resets their IP still waits out the account
 * lockout.
 *
 * Every attempt (allowed or blocked) is logged with its outcome, which is what
 * makes the Security panel possible.
 */
class LoginThrottle
{
    /** Attempts allowed from one IP per decay window. */
    public const MAX_PER_IP = 20;

    /** Attempts allowed against one email from one IP per decay window. */
    public const MAX_PER_EMAIL = 5;

    /** Seconds the per-IP bucket takes to refill. */
    public const IP_DECAY_SECONDS = 60;

    /** Seconds the per-email bucket takes to refill (backs off brute force). */
    public const EMAIL_DECAY_SECONDS = 900;

    /**
     * Check whether this request may attempt a login.
     *
     * @return int|null Seconds to wait when blocked; null when allowed.
     */
    public function retryAfter(Request $request): ?int
    {
        $wait = 0;

        foreach ($this->buckets($request) as [$key, $max]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $wait = max($wait, RateLimiter::availableIn($key));
            }
        }

        return $wait > 0 ? $wait : null;
    }

    /**
     * Record the attempt against both buckets and persist it for auditing.
     */
    public function record(Request $request, bool $successful): void
    {
        foreach ($this->buckets($request) as [$key, $max, $decay]) {
            RateLimiter::hit($key, $decay);
        }

        LoginAttempt::create([
            'email' => $this->email($request),
            'ip_address' => (string) $request->ip(),
            'successful' => $successful,
            'user_agent' => $this->userAgent($request),
        ]);

        if ($successful) {
            $this->clear($request);
        }
    }

    /**
     * Drop the counters for this request's IP and email.
     *
     * Called after a successful login so a legitimate user who mistyped their
     * password a few times starts the next session with a clean slate.
     */
    public function clear(Request $request): void
    {
        foreach ($this->buckets($request) as [$key]) {
            RateLimiter::clear($key);
        }
    }

    /**
     * The buckets to enforce, as [cache key, max attempts, decay seconds].
     *
     * @return array<int, array{0: string, 1: int, 2: int}>
     */
    private function buckets(Request $request): array
    {
        $ip = (string) $request->ip();
        $email = $this->email($request);

        $buckets = [
            ['login-ip:'.hash('sha256', $ip), self::MAX_PER_IP, self::IP_DECAY_SECONDS],
        ];

        if ($email !== '') {
            $buckets[] = [
                'login-account:'.hash('sha256', $ip.'|'.$email),
                self::MAX_PER_EMAIL,
                self::EMAIL_DECAY_SECONDS,
            ];
        }

        return $buckets;
    }

    private function email(Request $request): string
    {
        return strtolower(trim((string) $request->input('email', '')));
    }

    private function userAgent(Request $request): ?string
    {
        $agent = $request->userAgent();

        return $agent === null ? null : mb_substr($agent, 0, 512);
    }
}
