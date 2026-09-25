<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Append-only record of authentication attempts.
 *
 * Exists so an administrator can see brute-force patterns (one IP spraying many
 * accounts, or many IPs targeting one account) rather than only feeling the
 * effect of the throttle as a 429.
 */
#[Fillable(['email', 'ip_address', 'successful', 'user_agent'])]
class LoginAttempt extends Model
{
    protected function casts(): array
    {
        return [
            'successful' => 'boolean',
        ];
    }
}
