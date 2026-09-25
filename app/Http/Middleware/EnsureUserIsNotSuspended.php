<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuse authenticated access for suspended accounts.
 *
 * Suspension has to be enforced on every request, not only at login and not
 * only by deleting tokens. Deleting tokens is a best-effort cleanup that can
 * race (a request already in flight, a token reissued by another path), whereas
 * this check is the authority: if the account is suspended, it cannot act,
 * regardless of which token it presents.
 *
 * The account's tokens are also revoked the first time a suspended request
 * arrives, so the invalid state does not linger in the database.
 */
class EnsureUserIsNotSuspended
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null && $user->is_suspended) {
            $user->tokens()->delete();

            return response()->json([
                'message' => 'Account suspended. Contact support.',
            ], 403);
        }

        return $next($request);
    }
}
