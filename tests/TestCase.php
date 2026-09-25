<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\RateLimiter;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Rate limiter state lives in the cache and is NOT reset by
        // RefreshDatabase, so counters leak between tests: a suite with
        // several login tests would start returning 429s purely because of
        // test order. Clear every bucket before each test so throttling
        // behaviour is asserted only where a test asks for it.
        RateLimiter::clear('');
        $this->clearLoginThrottle();
    }

    /**
     * Clear the login throttle buckets for the default test client.
     *
     * Request IP and email vary per test, so the buckets are enumerated by
     * probing the same key shapes LoginThrottle uses.
     */
    private function clearLoginThrottle(): void
    {
        foreach (['127.0.0.1', '::1', 'localhost'] as $ip) {
            RateLimiter::clear('login-ip:'.hash('sha256', $ip));
        }
    }
}
