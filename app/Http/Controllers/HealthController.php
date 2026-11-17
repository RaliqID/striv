<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    /**
     * Public lightweight health check.
     * Suitable for uptime monitors, load balancers, and container health probes.
     */
    public function check(): JsonResponse
    {
        $start = microtime(true);
        $dbHealthy = false;

        try {
            DB::select('SELECT 1');
            $dbHealthy = true;
        } catch (Throwable) {
            $dbHealthy = false;
        }

        $latency = round((microtime(true) - $start) * 1000, 2);

        if (! $dbHealthy) {
            return response()->json([
                'status' => 'degraded',
                'timestamp' => now()->toIso8601String(),
                'version' => config('app.version', '1.0.0'),
                'database' => 'error',
                'latency_ms' => $latency,
            ], 503);
        }

        return response()->json([
            'status' => 'ok',
            'timestamp' => now()->toIso8601String(),
            'version' => config('app.version', '1.0.0'),
            'database' => 'ok',
            'latency_ms' => $latency,
        ]);
    }

    /**
     * Admin-scoped detailed system telemetry and queue health.
     */
    public function admin(Request $request): JsonResponse
    {
        $start = microtime(true);
        $dbHealthy = false;
        $dbError = null;

        try {
            DB::select('SELECT 1');
            $dbHealthy = true;
        } catch (Throwable $e) {
            $dbHealthy = false;
            $dbError = $e->getMessage();
        }

        $dbLatency = round((microtime(true) - $start) * 1000, 2);

        // Queue diagnostics
        $pendingJobs = 0;
        $failedJobs = 0;
        try {
            $pendingJobs = DB::table('jobs')->count();
        } catch (Throwable) {
            $pendingJobs = 0;
        }

        try {
            $failedJobs = DB::table('failed_jobs')->count();
        } catch (Throwable) {
            $failedJobs = 0;
        }

        // Cache probe
        $cacheHealthy = false;
        try {
            $testKey = 'health_probe_'.now()->timestamp;
            Cache::put($testKey, 'ok', 5);
            $cacheHealthy = Cache::get($testKey) === 'ok';
            Cache::forget($testKey);
        } catch (Throwable) {
            $cacheHealthy = false;
        }

        // Storage write test
        $storageHealthy = is_writable(storage_path('framework/cache'));

        $status = ($dbHealthy && $cacheHealthy && $storageHealthy) ? 'ok' : 'degraded';

        return response()->json([
            'status' => $status,
            'timestamp' => now()->toIso8601String(),
            'version' => config('app.version', '1.0.0'),
            'database' => [
                'status' => $dbHealthy ? 'ok' : 'error',
                'latency_ms' => $dbLatency,
                'connection' => config('database.default'),
                'driver' => DB::connection()->getDriverName(),
                'error' => $dbError,
            ],
            'queue' => [
                'status' => $failedJobs > 0 ? 'warning' : 'ok',
                'driver' => config('queue.default'),
                'pending_jobs' => $pendingJobs,
                'failed_jobs' => $failedJobs,
            ],
            'cache' => [
                'status' => $cacheHealthy ? 'ok' : 'error',
                'driver' => config('cache.default'),
            ],
            'storage' => [
                'status' => $storageHealthy ? 'ok' : 'error',
                'writable' => $storageHealthy,
            ],
            'system' => [
                'php_version' => PHP_VERSION,
                'laravel_version' => app()->version(),
                'memory_usage_mb' => round(memory_get_usage(true) / 1024 / 1024, 2),
                'server_time' => now()->toIso8601String(),
            ],
        ]);
    }
}
