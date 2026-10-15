<?php

namespace App\Services\Training;

use App\Models\Exercise;
use App\Models\WorkoutSetPhoto;
use Illuminate\Support\Facades\Log;

/**
 * Judges whether a photo is genuine evidence of a claimed exercise.
 *
 * ---------------------------------------------------------------------------
 * WHY A MODEL, AND WHY IT GATES A STATE CHANGE
 * ---------------------------------------------------------------------------
 * This is the component that stops the checklist from being theatre. A rule of
 * "attach any photo" is satisfied by photographing a banana, so the check is
 * not "is there an image" but "does this image show the movement being logged".
 *
 * The model is asked for a structured verdict rather than a free-text opinion,
 * because the result has to gate a state change: the set is either allowed to
 * be completed or it is not, and that decision must be made from a parseable
 * field, not from prose the caller would have to interpret.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR OUTCOMES
 * ---------------------------------------------------------------------------
 *   plausible  — equipment and setting match the exercise.
 *                ACCEPT, and the set is completed.
 *
 *   unclear    — a real training scene that cannot be tied to the movement
 *                (bad angle, blurred, a dark gym).
 *                ACCEPT, but flag for the trainer. Blocking here would punish
 *                honest members with a mid-range phone in a badly lit gym, which
 *                is most of the target audience.
 *
 *   rejected   — clearly not a training scene, or clearly a different activity.
 *                REFUSE, and the set stays incomplete.
 *
 *   unverified — NO MODEL COULD BE REACHED. This is not a judgement about the
 *                photo at all; it is an infrastructure failure. Handled the same
 *                way as `unclear` (accept, flag for review) but recorded with an
 *                explicit `unverified` flag so the trainer can tell "we looked
 *                and were unsure" apart from "we never looked".
 *
 * The `unverified` case is the one worth understanding, because it is the only
 * outcome caused by something other than the photo. It is produced by
 * VisionClient returning null after exhausting its whole provider chain (see
 * that class), and it exists so an AI outage degrades the feature instead of
 * breaking it: the member's set still completes, their session is not blocked,
 * and the claim is recorded as UNPROVEN rather than quietly marked as proven.
 *
 * The opposite shortcut was tried and rejected: silently accepting the photo when
 * no model answered. That made a photo of a bicep curl claiming a squat pass as
 * "verified" purely because the AI was down, which defeats the entire feature.
 *
 * @see \App\Services\Training\VisionClient  for the provider chain and its failure handling
 * @see \App\Http\Controllers\WorkoutSetPhotoController  for how a verdict becomes a stored photo and a completed set
 */
class WorkoutPhotoVerifier
{
    /**
     * Cap on how much of the image description we accept back, so a
     * misbehaving model cannot stuff the column.
     */
    private const MAX_ANALYSIS_CHARS = 600;

    public function __construct(
        private readonly VisionClient $vision,
    ) {
    }

    /**
     * Analyse an image against the exercise it is supposed to prove.
     *
     * @param  string  $imageData  Raw base64 (no data: prefix)
     * @param  string  $mime       e.g. image/jpeg
     * @return array{verdict: string, analysis: string|null, confidence: float|null, unverified?: bool}
     */
    public function verify(string $imageData, string $mime, Exercise $exercise): array
    {
        $prompt = $this->buildPrompt($exercise);

        $reply = $this->vision->ask($prompt, $imageData, $mime);

        if ($reply === null) {
            /*
             * Every vision endpoint failed.
             *
             * This is treated as a provider outage, NOT as evidence that the
             * photo is bad — and equally not as evidence that it is good.
             *
             * The earlier behaviour here accepted the photo silently, which was
             * wrong in a way the tests caught: while Gemini was down, a photo of
             * a bicep curl claiming a squat was marked "accepted" purely because
             * nothing could check it. That defeats the entire feature.
             *
             * So the verdict is `unclear`: the set is allowed (an outage must
             * not block a member's training) but the photo is flagged
             * `unverified`, which the trainer's review surfaces. The claim is
             * recorded as unproven rather than as proven.
             */
            Log::warning('WorkoutPhotoVerifier: no vision model answered, marking unverified', [
                'exercise' => $exercise->name,
            ]);

            return [
                'verdict' => WorkoutSetPhoto::VERDICT_UNCLEAR,
                'analysis' => null,
                'confidence' => null,
                'unverified' => true,
            ];
        }

        return $this->parseReply($reply);
    }

    /**
     * The verification prompt.
     *
     * Two separate questions, asked in that order, because they are genuinely
     * different failures. "Is this a gym?" catches the banana. "Is this the
     * claimed movement?" catches a photo of a pull-up bar submitted for a squat.
     * Collapsing them into one question makes the model lenient about both.
     */
    private function buildPrompt(Exercise $exercise): string
    {
        $equipment = $exercise->equipment ?? 'unspecified';

        return <<<PROMPT
        You are checking whether a member's photo is valid evidence that they performed a specific exercise.

        CLAIMED EXERCISE: {$exercise->name}
        TYPICAL EQUIPMENT: {$equipment}

        Answer these two questions, in order:

        1. Is this a real training scene? Look for gym equipment, weights, machines,
           a training floor, chalk, mats, or the member mid-movement. A photo of food,
           a pet, a screenshot, a receipt, a person sitting at a desk, or any indoor
           scene with no training context is NOT a training scene.

        2. Does what is visible match the CLAIMED EXERCISE? The equipment in the photo
           should be the kind used for that movement. A squat rack or barbell for a
           squat; a bench and bar for a bench press; a cable stack for a lat pulldown.
           If it is clearly a different activity, that is a mismatch.

        Then choose exactly one verdict:

        - "plausible": a real training scene whose equipment matches the claimed exercise.
        - "unclear": a real training scene, but the angle, lighting or framing means you
          cannot tell which movement it is. Use this when you believe the person is
          training but cannot confirm the specific exercise.
        - "rejected": not a training scene at all, OR clearly a different activity
          than claimed.

        Respond with JSON only, no prose and no markdown fences:
        {"verdict": "plausible|unclear|rejected", "confidence": 0.0-1.0, "analysis": "one or two factual sentences describing what you actually see, and why the verdict follows"}
        PROMPT;
    }

    /**
     * @return array{verdict: string, analysis: string|null, confidence: float|null, unverified?: bool}
     */
    private function parseReply(string $reply): array
    {
        $decoded = $this->decodeJson($reply);

        if ($decoded === null) {
            return $this->fallbackUnclear('reply was not JSON');
        }

        $verdict = strtolower(trim((string) ($decoded['verdict'] ?? '')));

        // Anything outside the three known verdicts is treated as unclear rather
        // than guessed at, so an unexpected word cannot silently approve a photo.
        if (! in_array($verdict, [
            WorkoutSetPhoto::VERDICT_PLAUSIBLE,
            WorkoutSetPhoto::VERDICT_UNCLEAR,
            WorkoutSetPhoto::VERDICT_REJECTED,
        ], true)) {
            return $this->fallbackUnclear('unknown verdict: '.$verdict);
        }

        $analysis = isset($decoded['analysis']) && is_string($decoded['analysis'])
            ? mb_substr(trim($decoded['analysis']), 0, self::MAX_ANALYSIS_CHARS)
            : null;

        $confidence = null;
        if (isset($decoded['confidence']) && is_numeric($decoded['confidence'])) {
            $confidence = max(0.0, min(1.0, (float) $decoded['confidence']));
        }

        return [
            'verdict' => $verdict,
            'analysis' => $analysis,
            'confidence' => $confidence,
        ];
    }

    /** Tolerant JSON extraction: models sometimes wrap in fences or add prose. */
    private function decodeJson(string $raw): ?array
    {
        $direct = json_decode($raw, true);
        if (is_array($direct)) {
            return $direct;
        }

        $start = strpos($raw, '{');
        $end = strrpos($raw, '}');

        if ($start === false || $end === false || $end <= $start) {
            return null;
        }

        $decoded = json_decode(substr($raw, $start, $end - $start + 1), true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @return array{verdict: string, analysis: string|null, confidence: float|null, unverified?: bool}
     */
    private function fallbackUnclear(string $why): array
    {
        return [
            'verdict' => WorkoutSetPhoto::VERDICT_UNCLEAR,
            'analysis' => 'Could not analyse this photo ('.$why.').',
            'confidence' => null,
        ];
    }
}
