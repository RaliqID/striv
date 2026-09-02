<?php

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$u = App\Models\User::first();
if (!$u) { echo "no user\n"; exit; }

$token = $u->createToken('full-audit')->plainTextToken;
$H = ['Authorization' => 'Bearer ' . $token, 'Accept' => 'application/json'];
$base = 'http://127.0.0.1:8000/api/v1';

$fail = 0;
$endpoints = [
    // Auth pages target
    '/auth/user',
    // Dashboard
    '/analytics/dashboard',
    '/goals?status=active',
    '/reviews/weekly?page=1',
    // Workout
    '/workout-sessions?page=1',
    '/routines?page=1',
    // Progress
    '/analytics/progress?days=90',
    // Exercises
    '/exercises?page=1',
    // Goals
    '/goals',
    // Insights
    '/insights',
    '/analytics/progress?days=90',
    // Reviews
    '/reviews/weekly',
    // History
    '/workout-sessions?page=1',
    // Records
    '/records',
    // Profile
    '/profile',
    // Settings
    '/profile',
    // Coach
    '/chat',
];

$seen = [];
foreach ($endpoints as $ep) {
    $key = $ep;
    if (isset($seen[$key])) continue;
    $seen[$key] = true;

    $r = Illuminate\Support\Facades\Http::withHeaders($H)->get($base . $ep);
    $ok = $r->status() === 200;
    if (!$ok) $fail++;
    echo ($ok ? "PASS" : "FAIL") . " $ep — " . $r->status() . "\n";
}

echo "\n" . (count($seen) - $fail) . "/" . count($seen) . " endpoints working\n";
$u->tokens()->where('name', 'full-audit')->delete();
