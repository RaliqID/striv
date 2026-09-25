<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Security\LoginThrottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;

class AuthController extends Controller
{
    public function __construct(private readonly LoginThrottle $throttle)
    {
    }

    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        // Create empty profile
        $user->profile()->create();
        $user->load('profile');

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        // Throttle before touching the database so a flood of attempts is
        // rejected cheaply, and so no credential check work is done for a
        // caller that is already over the limit.
        if (($retryAfter = $this->throttle->retryAfter($request)) !== null) {
            $this->throttle->record($request, false);

            return response()->json([
                'message' => 'Too many login attempts. Please try again in '
                    .ceil($retryAfter / 60).' minute(s).',
            ], 429, ['Retry-After' => (string) $retryAfter]);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            $this->throttle->record($request, false);

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->is_suspended) {
            $this->throttle->record($request, false);

            return response()->json(['message' => 'Account suspended. Contact support.'], 403);
        }

        $this->throttle->record($request, true);

        $user->load('profile');

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function user(Request $request)
    {
        return response()->json(
            $request->user()->load('profile')
        );
    }

    public function redirectToGoogle()
    {
        return Socialite::driver('google')
            ->stateless()
            ->redirectUrl(config('services.google.redirect'))
            ->with(['prompt' => 'select_account'])
            ->redirect();
    }

    public function handleGoogleCallback()
    {
        $googleUser = Socialite::driver('google')->stateless()->user();

        $user = User::where('email', $googleUser->email)->first();

        if (! $user) {
            $user = User::create([
                'name' => $googleUser->name,
                'email' => $googleUser->email,
                'password' => Hash::make(Str::random(24)),
            ]);
            $user->profile()->create();
        }

        $user->load('profile');

        $token = $user->createToken('auth_token')->plainTextToken;

        $needsOnboarding = $user->profile === null
            || $user->profile->onboarding_completed_at === null;

        $frontend = config('app.frontend_url', 'http://localhost:3000');
        $path = $needsOnboarding ? '/onboarding' : '/dashboard';

        return redirect($frontend . $path . '?token=' . $token);
    }
}