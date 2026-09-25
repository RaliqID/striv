<?php

namespace App\Http\Controllers;

use App\Models\LoginAttempt;
use App\Services\Security\LoginThrottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Read-only view of authentication traffic, so an administrator can see an
 * attack happening rather than only inferring it from support complaints.
 *
 * The interesting signal is aggregation, not individual rows: one IP across
 * many emails (spraying) and one email across many IPs (distributed guessing)
 * are the two shapes worth surfacing.
 */
class AdminSecurityController extends Controller
{
    public function index(Request $request)
    {
        $since = now()->subDays(min(30, max(1, (int) $request->query('days', 7))));

        $base = fn () => LoginAttempt::where('created_at', '>=', $since);

        $total = $base()->count();
        $failed = $base()->where('successful', false)->count();
        $succeeded = $base()->where('successful', true)->count();

        // Currently-locked buckets: accounts that have burned the tight limit.
        $lockedAccounts = $this->lockedAccounts($since);

        return response()->json([
            'window_days' => (int) $request->query('days', 7),
            'summary' => [
                'total_attempts' => $total,
                'failed_attempts' => $failed,
                'successful_attempts' => $succeeded,
                'failure_rate' => $total > 0 ? round($failed / $total * 100, 1) : 0.0,
                'distinct_ips' => $base()->distinct()->count('ip_address'),
                'distinct_emails' => $base()->whereNotNull('email')->distinct()->count('email'),
                'locked_accounts' => $lockedAccounts->count(),
            ],
            // IPs failing repeatedly — the classic single-host attack.
            'top_offending_ips' => $base()
                ->where('successful', false)
                ->selectRaw('ip_address, count(*) as failures, count(distinct email) as distinct_emails, max(created_at) as last_seen_at')
                ->groupBy('ip_address')
                ->orderByDesc('failures')
                ->limit(10)
                ->get()
                ->map(fn ($row) => [
                    'ip_address' => $row->ip_address,
                    'failures' => (int) $row->failures,
                    'distinct_emails' => (int) $row->distinct_emails,
                    'last_seen_at' => $row->last_seen_at,
                ])
                ->values(),
            // Accounts absorbing failures — either targeted or badly managed.
            'top_targeted_accounts' => $base()
                ->where('successful', false)
                ->whereNotNull('email')
                ->selectRaw('email, count(*) as failures, count(distinct ip_address) as distinct_ips, max(created_at) as last_seen_at')
                ->groupBy('email')
                ->orderByDesc('failures')
                ->limit(10)
                ->get()
                ->map(fn ($row) => [
                    'email' => $row->email,
                    'failures' => (int) $row->failures,
                    'distinct_ips' => (int) $row->distinct_ips,
                    'last_seen_at' => $row->last_seen_at,
                ])
                ->values(),
            'recent_attempts' => $base()
                ->latest()
                ->limit(50)
                ->get()
                ->map(fn (LoginAttempt $attempt) => [
                    'id' => $attempt->id,
                    'email' => $attempt->email,
                    'ip_address' => $attempt->ip_address,
                    'successful' => $attempt->successful,
                    'user_agent' => $attempt->user_agent,
                    'created_at' => $attempt->created_at?->toIso8601String(),
                ])
                ->values(),
        ]);
    }

    /**
     * Accounts currently over the per-account throttle.
     *
     * Read from the live limiter rather than from the log, because a lock is a
     * property of the limiter's current state, not of historical failures.
     * The bucket is keyed by IP+email, so a candidate account counts as locked
     * when any address that has attacked it is still over the limit.
     */
    private function lockedAccounts($since)
    {
        $candidates = LoginAttempt::where('created_at', '>=', $since)
            ->where('successful', false)
            ->whereNotNull('email')
            ->select('email')
            ->distinct()
            ->pluck('email');

        return $candidates->filter(function (string $email) use ($since) {
            $ips = LoginAttempt::where('created_at', '>=', $since)
                ->where('email', $email)
                ->where('successful', false)
                ->distinct()
                ->pluck('ip_address');

            foreach ($ips as $ip) {
                $key = 'login-account:'.hash('sha256', $ip.'|'.$email);

                if (RateLimiter::tooManyAttempts($key, LoginThrottle::MAX_PER_EMAIL)) {
                    return true;
                }
            }

            return false;
        })->values();
    }
}
