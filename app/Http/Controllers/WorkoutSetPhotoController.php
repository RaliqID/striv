<?php

namespace App\Http\Controllers;

use App\Models\WorkoutSession;
use App\Models\WorkoutSet;
use App\Models\WorkoutSetPhoto;
use App\Services\Training\WorkoutPhotoVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Photo evidence for a workout set.
 *
 * A set is only complete once a photo proves it, and the photo is checked
 * against the claimed exercise before it counts. That two-step is the feature:
 * requiring a file is satisfied by anything, so the verification is what makes
 * the log trustworthy and stops a session being ticked off from the sofa.
 *
 * Ownership is enforced through the session, not just the set id: a set id
 * alone would let any authenticated member attach photos to somebody else's
 * workout.
 */
class WorkoutSetPhotoController extends Controller
{
    /** Reject anything above this; phone cameras sit well under it. */
    private const MAX_BYTES = 8 * 1024 * 1024;

    private const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    public function __construct(private readonly WorkoutPhotoVerifier $verifier)
    {
    }

    /**
     * Attach a photo to a set and verify it.
     *
     * Returns the verdict so the client can either complete the set or explain
     * why it will not. Never returns a bare 200 for a rejected photo, because
     * the client must not treat "uploaded" as "accepted".
     */
    public function store(
        Request $request,
        WorkoutSession $workout_session,
        WorkoutSet $set,
    ): JsonResponse {
        $this->authorizeSet($request, $workout_session, $set);

        $validated = $request->validate([
            // Base64 rather than multipart: the client already downscales on
            // canvas before sending, and one JSON body keeps the client simple.
            'image' => ['required', 'string'],
            'mime' => ['required', 'string', 'in:'.implode(',', self::ALLOWED_MIMES)],
        ]);

        $binary = $this->decodeImage($validated['image']);

        if ($binary === null) {
            return response()->json(['message' => __('messages.photo.invalid_image')], 422);
        }

        if (strlen($binary) > self::MAX_BYTES) {
            return response()->json(['message' => __('messages.photo.too_large')], 422);
        }

        // The exercise this set belongs to decides what the photo must show.
        $set->loadMissing('workoutExercise.exercise');
        $exercise = $set->workoutExercise?->exercise;

        if ($exercise === null) {
            return response()->json(['message' => __('messages.photo.no_exercise')], 422);
        }

        // One photo per set: replace an existing one so a member can retake a
        // blurry shot without being stuck.
        $existing = WorkoutSetPhoto::where('workout_set_id', $set->id)->first();

        if ($existing !== null) {
            Storage::disk('local')->delete($existing->path);
            $existing->delete();
        }

        $verdict = $this->verifier->verify($validated['image'], $validated['mime'], $exercise);

        $path = $this->persist($binary, $validated['mime'], $request->user()->id);

        $photo = DB::transaction(function () use ($set, $request, $path, $validated, $verdict, $binary) {
            $photo = WorkoutSetPhoto::create([
                'workout_set_id' => $set->id,
                'user_id' => $request->user()->id,
                'path' => $path,
                'mime' => $validated['mime'],
                'size_bytes' => strlen($binary),
                'ai_analysis' => $verdict['analysis'],
                'ai_verdict' => $verdict['verdict'],
                'unverified' => $verdict['unverified'] ?? false,
                'ai_confidence' => $verdict['confidence'],
            ]);

            /*
             * A non-rejected photo completes the set.
             *
             * This is the moment the set becomes real: the check is applied
             * here, server-side, rather than trusting the client to only send
             * the request for an accepted photo.
             */
            if ($photo->isAccepted()) {
                $set->forceFill([
                    'completed_at' => $set->completed_at ?? now(),
                ])->save();
            }

            return $photo;
        });

        return response()->json([
            'accepted' => $photo->isAccepted(),
            'verdict' => $photo->ai_verdict,
            // Tells the client the check could not run, so it can say "could not
            // verify" instead of implying the photo was confirmed.
            'unverified' => $photo->wasUnverified(),
            'confidence' => $photo->ai_confidence,
            'analysis' => $photo->ai_analysis,
            'photo' => $this->format($photo),
            'set' => [
                'id' => $set->id,
                'completed_at' => $set->refresh()->completed_at?->toIso8601String(),
            ],
            'message' => $photo->isAccepted()
                ? ($photo->wasUnverified()
                    ? __('messages.photo.accepted_unverified')
                    : __('messages.photo.accepted'))
                : __('messages.photo.rejected'),
        ], $photo->isAccepted() ? 201 : 422);
    }

    /**
     * Remove a set's photo.
     *
     * Also clears the completion, because a set with no evidence must not stay
     * marked done — that is the whole guarantee the photo provides.
     */
    public function destroy(
        Request $request,
        WorkoutSession $workout_session,
        WorkoutSet $set,
    ): JsonResponse {
        $this->authorizeSet($request, $workout_session, $set);

        $photo = WorkoutSetPhoto::where('workout_set_id', $set->id)->firstOrFail();

        Storage::disk('local')->delete($photo->path);
        $photo->delete();

        $set->forceFill(['completed_at' => null])->save();

        return response()->json([
            'set' => ['id' => $set->id, 'completed_at' => null],
            'message' => __('messages.photo.removed'),
        ]);
    }

    /** The photo a trainer is looking at, streamed from private storage. */
    public function show(
        Request $request,
        WorkoutSession $workout_session,
        WorkoutSet $set,
    ): JsonResponse {
        $this->authorizeSet($request, $workout_session, $set);

        $photo = WorkoutSetPhoto::where('workout_set_id', $set->id)->firstOrFail();

        return response()->json(['photo' => $this->format($photo)]);
    }

    /**
     * Stream the image bytes.
     *
     * Photos live on the private disk, so they are served through this
     * authorised route rather than a public URL. The client uses the URL this
     * returns on the photo payload; the fact that it is a route rather than a
     * stored path means a member cannot enumerate other members' photos.
     */
    public function file(Request $request, WorkoutSetPhoto $photo)
    {
        $user = $request->user();
        $session = $photo->workoutSet?->workoutExercise?->workoutSession;

        if ($session === null) {
            abort(404);
        }

        $isOwner = $user->id === $photo->user_id;
        $isCoach = $user->canAccessPanel()
            && app(\App\Policies\TrainerAssignmentPolicy::class)->coaches($user, $photo->user);

        if (! $isOwner && ! $isCoach) {
            abort(404);
        }

        $disk = Storage::disk('local');

        if (! $disk->exists($photo->path)) {
            abort(404);
        }

        return response($disk->get($photo->path), 200, [
            'Content-Type' => $photo->mime,
            // Private: these are photos of members and must not sit in a shared
            // cache. `private` also keeps intermediaries from storing them.
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    // ------------------------------------------------------------------

    /**
     * Only the member whose session this is, or a trainer who coaches them.
     *
     * Walked through the session rather than the set so a guessed set id cannot
     * reach another member's workout.
     */
    private function authorizeSet(Request $request, WorkoutSession $session, WorkoutSet $set): void
    {
        // Resolve the owning session through the exercise relation, which is
        // where the foreign key actually lives.
        $set->loadMissing('workoutExercise');
        $belongs = $set->workoutExercise?->workout_session_id === $session->id;

        if (! $belongs) {
            abort(response()->json(['message' => __('messages.photo.not_found')], 404));
        }

        $user = $request->user();

        if ($user->id === $session->user_id) {
            return;
        }

        // A trainer reviewing a client's evidence is legitimate.
        $coaches = $user->canAccessPanel()
            && app(\App\Policies\TrainerAssignmentPolicy::class)->coaches($user, $session->user);

        if (! $coaches) {
            abort(response()->json(['message' => __('messages.photo.not_found')], 404));
        }
    }

    /** Decode base64, tolerating a data: prefix the client may leave on. */
    private function decodeImage(string $encoded): ?string
    {
        if (str_contains($encoded, ',')) {
            $encoded = substr($encoded, strpos($encoded, ',') + 1);
        }

        $binary = base64_decode($encoded, true);

        return $binary === false ? null : $binary;
    }

    /**
     * Persist to the private disk.
     *
     * Not the public disk: these are photos of members, so they are served
     * through an authorised endpoint rather than by a guessable public URL.
     */
    private function persist(string $binary, string $mime, int $userId): string
    {
        $ext = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/heic', 'image/heif' => 'heic',
            default => 'jpg',
        };

        $name = 'workout-photos/'.$userId.'/'.now()->format('Y/m').'/'.Str::uuid().'.'.$ext;

        Storage::disk('local')->put($name, $binary);

        return $name;
    }

    /** @return array<string, mixed> */
    private function format(WorkoutSetPhoto $photo): array
    {
        return [
            'id' => $photo->id,
            'set_id' => $photo->workout_set_id,
            'verdict' => $photo->ai_verdict,
            'unverified' => $photo->wasUnverified(),
            'analysis' => $photo->ai_analysis,
            'confidence' => $photo->ai_confidence,
            'reviewed' => $photo->isReviewed(),
            'trainer_note' => $photo->trainer_note,
            'created_at' => $photo->created_at?->toIso8601String(),
            // Served through the authorised route, never a public URL.
            'url' => route('workout-set-photo.file', ['photo' => $photo->id]),
        ];
    }
}
