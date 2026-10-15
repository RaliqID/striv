<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restricts a route to full administrators only.
 *
 * Trainers deliberately do NOT pass this. They share the panel layout and most
 * read endpoints, but destructive account operations (delete, suspend, role
 * changes, audit log) stay admin-only — use EnsureUserCanAccessPanel for those
 * shared surfaces instead.
 */
class EnsureUserIsAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->isAdmin()) {
            abort(response()->json(['message' => 'Admin access required.'], 403));
        }

        return $next($request);
    }
}
