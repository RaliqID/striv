<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Security\LoginThrottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        /*
         * Signup writes three related rows, so it happens atomically.
         *
         *   1. the user
         *   2. their (empty) profile
         *   3. their training request
         *
         * Without a transaction a failure between them leaves a half-created
         * account, and the most damaging version of that is a user with no
         * profile: the app gates the member area on `profile.onboarding_completed_at`,
         * so that account is redirected to onboarding on every single login and
         * can never reach the app. It also cannot re-register, because the email
         * is already taken — the member is permanently locked out of an account
         * they just created.
         *
         * Rolling back on failure means a failed signup leaves nothing behind and
         * the person can simply try again.
         */
        [$user, $token] = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'role' => User::ROLE_USER,
            ]);

            // Create empty profile
            $user->profile()->create();
            $user->load('profile');

            /*
             * Open the training request immediately.
             *
             * The matching itself runs after onboarding, because it depends on the
             * goal the member picks there — but the request exists from signup so
             * there is never an "I signed up and nothing happened" gap, and an
             * abandoned onboarding still shows up as demand in the admin queue.
             */
            app(\App\Services\Training\TrainerMatchingService::class)->requestFor($user);

            $token = $user->createToken('auth_token')->plainTextToken;

            return [$user, $token];
        });

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
                'message' => __('messages.auth.too_many_attempts', [
                    'minutes' => (int) ceil($retryAfter / 60),
                ]),
            ], 429, ['Retry-After' => (string) $retryAfter]);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            $this->throttle->record($request, false);

            throw ValidationException::withMessages([
                'email' => [__('messages.auth.invalid_credentials')],
            ]);
        }

        if ($user->is_suspended) {
            $this->throttle->record($request, false);

            return response()->json(['message' => __('messages.auth.suspended')], 403);
        }

        $this->throttle->record($request, true);

        $user->load('profile');

        $token = $user->createToken('auth_token')->plainTextToken;

        /*
         * Progression is included here for the same reason as in user(): the
         * client stores this payload and renders the sidebar level bar from it
         * immediately, without a second request. Omitting it left that bar stuck
         * on its loading placeholder after every sign-in.
         */
        return response()->json([
            'user' => [
                ...$user->toArray(),
                ...$this->progressionFor($user),
            ],
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => __('messages.auth.logged_out')]);
    }

    public function user(Request $request)
    {
        $user = $request->user()->load('profile');

        return response()->json([
            ...$user->toArray(),
            ...$this->progressionFor($user),
        ]);
    }

    /**
     * The progression summary attached to a user payload.
     *
     * Public so every endpoint that returns a user can include it without
     * duplicating the logic. Three do: `login`, `user`, and ProfileController's
     * `show`. Each was added separately and two of them were initially missed,
     * which is exactly the drift this method exists to prevent — the level bar
     * rendered as an empty placeholder on any page whose payload forgot it.
     *
     * Wrapped in try/catch because progression is decoration on top of
     * authentication: a failure in it must still return the user, never a 500
     * that would lock a member out of a working session. On failure the keys are
     * present but null, which the client already handles.
     *
     * @return array{progression: array|null, achievement_count: array|null}
     */
    public function progressionFor(User $user): array
    {
        try {
            return [
                'progression' => app(\App\Services\Progression\XpService::class)->progressFor($user),
                'achievement_count' => app(\App\Services\Progression\AchievementService::class)->countFor($user),
            ];
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Progression summary failed for user '.$user->id, [
                'error' => $e->getMessage(),
            ]);

            return [
                'progression' => null,
                'achievement_count' => null,
            ];
        }
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
            /*
             * Same three-row creation as the password signup, so the same
             * transaction wraps it — see register() for why. A Google signup
             * that fails after creating the user but before the profile would
             * leave an account that can never reach the app (the member area is
             * gated on the profile) and cannot be re-registered (the email is
             * taken).
             */
            $user = DB::transaction(function () use ($googleUser) {
                $user = User::create([
                    'name' => $googleUser->name,
                    'email' => $googleUser->email,
                    'password' => Hash::make(Str::random(24)),
                    'role' => User::ROLE_USER,
                ]);
                $user->profile()->create();

                // Same as the password path: demand is recorded at signup, the
                // match runs once onboarding supplies a goal.
                app(\App\Services\Training\TrainerMatchingService::class)->requestFor($user);

                return $user;
            });
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