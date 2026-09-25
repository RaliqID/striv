<?php

use Illuminate\Support\Facades\Route;

/*
 * Striv is a headless API consumed by the Next.js frontend (see routes/api.php).
 * This file exists only so a browser hitting the API host directly lands
 * somewhere useful instead of a framework placeholder page.
 */

Route::get('/', function () {
    $frontend = config('app.frontend_url');

    return $frontend
        ? redirect()->away($frontend)
        : response()->json([
            'name' => 'Striv API',
            'status' => 'ok',
            'docs' => 'The application is served by the frontend client.',
        ]);
});
