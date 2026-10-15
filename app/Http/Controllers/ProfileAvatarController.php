<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Profile photo upload, serving and removal.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FILE IS NOT PUBLICLY SERVED
 * ---------------------------------------------------------------------------
 * Avatars are stored on the private 'local' disk and streamed through the
 * authorised `show` endpoint, exactly as workout evidence photos are. A public
 * URL would make every member's face enumerable by anyone who can guess a path,
 * with no way to revoke it — and a member's photo is personal data.
 *
 * The cost is one authorised request per render, which the browser caches; the
 * benefit is that access can be withdrawn and the path is never an address
 * anybody can stumble onto.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PATH CARRIES A TIMESTAMP
 * ---------------------------------------------------------------------------
 * The stored path is a plain file path; the VERSION is exposed separately as a
 * query parameter on the serving URL. Uploading a new avatar writes a new file
 * and bumps `avatar_updated_at`, so the URL changes and browsers fetch the new
 * image instead of showing the previous one from a long-lived cache.
 *
 * Without that, a member would upload a photo and keep seeing the old one, which
 * reads as a broken upload rather than a caching artefact.
 */
class ProfileAvatarController extends Controller
{
    /** Matches the photo pipeline: browsers handle these everywhere. */
    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    /** 5 MB. A phone camera shot is 2-4 MB, so this admits a real photo but not a RAW file. */
    private const MAX_BYTES = 5 * 1024 * 1024;

    /**
     * How long a member must wait between photo changes.
     *
     * -----------------------------------------------------------------------
     * WHY A LIMIT EXISTS AT ALL
     * -----------------------------------------------------------------------
     * A profile photo is identity, not content. Without a limit, a member can
     * change their face faster than a trainer or an admin can recognise them,
     * which undermines the one thing the photo is for. It also caps the storage
     * and bandwidth a single account can consume by cycling images.
     *
     * Two days is chosen deliberately: long enough that it is a real deterrent
     * to casual churn, short enough that someone who genuinely dislikes their
     * new photo is not stuck with it for a week. It is a friction point, not a
     * punishment.
     *
     * The limit applies to REMOVAL as well as upload. Otherwise it is trivially
     * bypassed — remove, upload, remove, upload — and the restriction would exist
     * on paper only.
     */
    private const CHANGE_COOLDOWN_HOURS = 48;

    /**
     * Upload or replace the caller's avatar.
     *
     * The client sends base64 in a JSON body, matching how workout photos are
     * submitted, so there is one upload convention in the codebase rather than
     * two.
     */
    public function store(Request $request): JsonResponse
    {
        /*
         * Cooldown first, before any image work.
         *
         * Checked ahead of validation so a member inside the window gets the
         * real reason immediately, rather than being told their image is invalid
         * and then told to wait. It also avoids decoding and re-encoding bytes
         * for an upload that will be refused regardless.
         */
        if (($wait = $this->cooldownRemaining($request->user())) !== null) {
            return $this->cooldownResponse($wait);
        }

        $validated = $request->validate([
            'image' => ['required', 'string'],
            'mime' => ['required', 'string', 'in:'.implode(',', self::ALLOWED_MIMES)],
        ]);

        $binary = $this->decodeImage($validated['image']);

        if ($binary === null) {
            return response()->json([
                'message' => __('messages.profile.avatar_invalid'),
            ], 422);
        }

        if (strlen($binary) > self::MAX_BYTES) {
            return response()->json([
                'message' => __('messages.profile.avatar_too_large'),
            ], 422);
        }

        /*
         * Confirm the bytes really are an image of an allowed type.
         *
         * The `mime` field is client-supplied and therefore not evidence. This
         * reads the actual content; getimagesizefromstring returns false for
         * anything that is not a decodable image, which also rules out a
         * payload that merely claims to be a JPEG.
         */
        $detected = @getimagesizefromstring($binary);

        if ($detected === false || ! in_array($detected['mime'], self::ALLOWED_MIMES, true)) {
            return response()->json([
                'message' => __('messages.profile.avatar_invalid'),
            ], 422);
        }

        $user = $request->user();
        $previous = $user->avatar_path;

        $path = $this->persist($binary, $detected['mime'], $user->id);

        $user->forceFill([
            'avatar_path' => $path,
            // Stored so the serving endpoint does not have to probe the file.
            'avatar_mime' => $detected['mime'],
            'avatar_updated_at' => now(),
            // Start the member's cooldown. Set on success only — a rejected
            // upload must not cost them their next chance.
            'avatar_change_allowed_at' => now()->addHours(self::CHANGE_COOLDOWN_HOURS),
        ])->save();

        // Only after the new file is written and recorded: if the write failed,
        // the old avatar would otherwise be gone with nothing to replace it.
        if ($previous !== null && $previous !== $path) {
            Storage::disk('local')->delete($previous);
        }

        return response()->json([
            'avatar_url' => $this->urlFor($user),
            'avatar_updated_at' => $user->avatar_updated_at?->toIso8601String(),
        ]);
    }

    /**
     * Stream a member's avatar.
     *
     * -----------------------------------------------------------------------
     * WHY THIS IS REACHABLE WITHOUT A TOKEN
     * -----------------------------------------------------------------------
     * An <img> tag cannot send an Authorization header. It is not a fetch, so
     * there is nowhere to attach one — the browser requests the URL directly.
     * Putting this route behind `auth:sanctum` therefore produced a broken-image
     * icon for every avatar, because the request arrived unauthenticated and was
     * refused, even though the member was signed in.
     *
     * The alternatives were worse:
     *   - fetch the bytes and build a blob URL: works, but every avatar becomes a
     *     JS round trip, loses browser caching, and leaks the object URL if the
     *     component unmounts early.
     *   - store the file publicly: makes every member's face enumerable by
     *     anyone who can guess a path, with no way to revoke it.
     *
     * So the route is public, and the exposure is deliberately bounded:
     *
     *   - it serves ONE image and nothing else. No name, email, phone, profile
     *     or any other field is readable here.
     *   - it requires an explicit `user` id, so nothing is discoverable by
     *     walking a directory — the ids are already visible in the leaderboard.
     *   - it returns 404 unless that member has actually set a photo, so the
     *     endpoint reveals nothing about accounts that have not.
     *
     * A profile photo is data the member chose to display to other members —
     * the leaderboard shows faces beside names. Serving it to a signed-in peer
     * is the intended behaviour, not a leak. Anything genuinely private stays on
     * the authenticated routes.
     */
    public function show(Request $request)
    {
        $target = $request->query('user');

        /*
         * No `user` parameter means "my own avatar", which does need identity —
         * so that form falls back to the authenticated user when a token happens
         * to be present, and 404s otherwise rather than guessing.
         */
        $user = $target !== null
            ? User::find((int) $target)
            : $request->user();

        /*
         * A missing avatar is an ordinary state, not an error: most accounts
         * have none, and the UI shows initials instead. Returning an explicit
         * 404 response rather than abort() keeps that distinction visible — the
         * client renders its fallback, and nothing is logged as a fault.
         */
        if ($user === null || $user->avatar_path === null) {
            return response()->json(['message' => 'No avatar'], 404);
        }

        $disk = Storage::disk('local');

        if (! $disk->exists($user->avatar_path)) {
            // The row points at a file that is gone. Worth a warning: it means
            // storage was cleared without the database following, which is a
            // real operational fault rather than a missing avatar.
            Log::warning('Avatar file missing for user '.$user->id, [
                'path' => $user->avatar_path,
            ]);

            return response()->json(['message' => 'No avatar'], 404);
        }

        /*
         * The content type comes from the row, not from probing the file.
         *
         * It was verified at upload and stored alongside the path, so reading it
         * here would mean an extra filesystem call plus a mime lookup to learn
         * something already recorded. The fallback covers rows written before
         * the column existed.
         */
        $mime = $user->avatar_mime ?: 'image/jpeg';

        return response($disk->get($user->avatar_path), 200, [
            'Content-Type' => $mime,
            /*
             * Private: this is personal data and must not sit in a shared cache.
             * The URL carries a version, so a long max-age is safe for the
             * member's own browser and a new upload invalidates it by changing
             * the URL rather than by expiring the cache.
             */
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    /** Remove the caller's avatar, falling back to initials in the UI. */
    public function destroy(Request $request): JsonResponse
    {
        /*
         * The cooldown covers removal too.
         *
         * If only uploads were limited, the cycle "remove, upload, remove,
         * upload" would reset the photo as often as the member liked and the
         * restriction would be decorative. Removal changes what other people see,
         * so it counts as a change.
         */
        if (($wait = $this->cooldownRemaining($request->user())) !== null) {
            return $this->cooldownResponse($wait);
        }

        $user = $request->user();

        if ($user->avatar_path !== null) {
            Storage::disk('local')->delete($user->avatar_path);
        }

        $user->forceFill([
            'avatar_path' => null,
            'avatar_mime' => null,
            /*
             * avatar_updated_at is cleared WITH the file, because it versions a
             * URL that no longer resolves. avatar_change_allowed_at is NOT
             * cleared — it belongs to the action, not the file, which is what
             * stops the remove/upload cycle from bypassing the limit.
             */
            'avatar_updated_at' => null,
            'avatar_change_allowed_at' => now()->addHours(self::CHANGE_COOLDOWN_HOURS),
        ])->save();

        return response()->json(['avatar_url' => null]);
    }

    /**
     * How long until the member may change their photo again.
     *
     * Returns null when there is no restriction, which covers the two cases that
     * must never be blocked: a member who has never set a photo, and one whose
     * window has already elapsed.
     */
    private function cooldownRemaining(User $user): ?\Carbon\Carbon
    {
        $allowedAt = $user->avatar_change_allowed_at;

        if ($allowedAt === null || $allowedAt->isPast()) {
            return null;
        }

        return $allowedAt;
    }

    /**
     * The refusal for a member still inside their cooldown.
     *
     * 429 rather than 403: this is a rate limit, and 429 is what clients and
     * intermediaries already understand as "too soon, try later". The body
     * carries the exact moment so the UI can say when, instead of a vague
     * "not allowed" that leaves the member guessing.
     */
    private function cooldownResponse(\Carbon\Carbon $allowedAt): JsonResponse
    {
        return response()->json([
            'message' => __('messages.profile.avatar_cooldown', [
                'hours' => (int) ceil(now()->diffInMinutes($allowedAt) / 60),
            ]),
            'avatar_change_allowed_at' => $allowedAt->toIso8601String(),
        ], 429);
    }

    /**
     * The versioned URL for a user's avatar, or null when they have none.
     *
     * Shared with the auth payloads so the client never has to build this
     * string itself — a URL assembled in two places is a URL that will disagree
     * with itself after one of them changes.
     */
    public static function urlFor(?User $user): ?string
    {
        if ($user === null || $user->avatar_path === null) {
            return null;
        }

        // The timestamp makes the URL change on every upload, which is what
        // defeats a cached response without shortening the cache lifetime.
        $version = $user->avatar_updated_at?->timestamp ?? 0;

        return url('/api/v1/profile/avatar').'?user='.$user->id.'&v='.$version;
    }

    /**
     * Decode a base64 body, tolerating a data: URL prefix.
     *
     * Mirrors the workout photo pipeline: `canvas.toDataURL()` includes the
     * prefix, and rejecting that would make a valid upload look corrupt.
     */
    private function decodeImage(string $encoded): ?string
    {
        if (str_starts_with($encoded, 'data:')) {
            $comma = strpos($encoded, ',');

            if ($comma === false) {
                return null;
            }

            $encoded = substr($encoded, $comma + 1);
        }

        $binary = base64_decode($encoded, true);

        return $binary === false ? null : $binary;
    }

    /**
     * Write the file under a per-user folder.
     *
     * The name is random rather than derived from the user, so replacing an
     * avatar cannot overwrite a file that is still being served, and the
     * extension comes from the DETECTED mime rather than the client's claim.
     */
    private function persist(string $binary, string $mime, int $userId): string
    {
        $extension = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };

        $name = 'avatars/'.$userId.'/'.bin2hex(random_bytes(16)).'.'.$extension;

        Storage::disk('local')->put($name, $binary);

        return $name;
    }
}
