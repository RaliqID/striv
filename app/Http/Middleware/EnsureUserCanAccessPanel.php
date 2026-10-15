<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Allows any management-panel role through: admin OR trainer.
 *
 * Trainers are first-class panel users — they need the client list, schedules,
 * live session monitoring, and feedback tools. What they must NOT reach is
 * account administration, which stays behind EnsureUserIsAdmin.
 *
 * Every route group picks exactly one of these two middlewares, so the split
 * is explicit at the route file rather than buried in controller logic.
 */
class EnsureUserCanAccessPanel
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->canAccessPanel()) {
            abort(response()->json(['message' => 'Trainer or admin access required.'], 403));
        }

        return $next($request);
    }
}
