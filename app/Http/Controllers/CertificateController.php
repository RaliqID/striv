<?php

namespace App\Http\Controllers;

use App\Models\Certificate;
use App\Models\User;
use App\Services\Progression\CertificateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Certificates earned by completing a milestone in full.
 *
 * Read-only for the member: issuance happens automatically when a session
 * finishes and when the sweep runs. There is deliberately no "request a
 * certificate" endpoint, because a certificate is evidence of work rather than
 * something to be applied for.
 */
class CertificateController extends Controller
{
    public function __construct(private readonly CertificateService $certificates) {}

    /**
     * The member's certificates.
     *
     * Also returns the milestones not yet earned, with their progress toward
     * the threshold. Without that the page would be a list of what you already
     * have and nothing to aim at — the same reasoning as the badge board, where
     * locked badges are shown deliberately.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        try {
            // Sweep on read so a member who qualified before certificates
            // existed sees theirs without waiting for a scheduled run.
            $this->certificates->evaluate($user);
        } catch (\Throwable $e) {
            // A sweep failure must not hide certificates already issued.
            Log::warning('Certificate evaluation failed', ['user' => $user->id, 'error' => $e->getMessage()]);
        }

        $earned = $this->certificates->forUser($user);

        return response()->json([
            'certificates' => array_map(fn (Certificate $c) => $this->present($c), $earned),
            'locked' => $this->lockedMilestones($user, $earned),
            'count' => count($earned),
        ]);
    }

    /** A single certificate, including the full text for printing. */
    public function show(Request $request, Certificate $certificate): JsonResponse
    {
        // A certificate is personal, so it is only readable by its owner.
        if ($certificate->user_id !== $request->user()->id) {
            abort(403);
        }

        return response()->json(['certificate' => $this->present($certificate)]);
    }

    /**
     * The milestone keys for a certificate.
     *
     * name_key/subtitle_key are returned rather than rendered text so the client
     * can display the certificate in whichever language the member is reading,
     * and so a printed copy follows the language it was printed in.
     */
    private function present(Certificate $c): array
    {
        return [
            'id' => $c->id,
            'milestone' => $c->milestone,
            'serial' => $c->serial,
            'member_name' => $c->member_name,
            'name_key' => $c->titleKey(),
            'subtitle_key' => $c->subtitleKey(),
            'stats' => $c->stats,
            'trainer_name' => $c->trainer_name,
            'issued_at' => $c->issued_at?->toIso8601String(),
        ];
    }

    /**
     * Milestones still to be earned, with current progress.
     *
     * Progress is reported as the real numbers (sessions so far against the
     * threshold) so the page can show a bar rather than a bare lock.
     */
    private function lockedMilestones(User $user, array $earned): array
    {
        $earnedKeys = array_map(fn (Certificate $c) => $c->milestone, $earned);

        $out = [];

        foreach (CertificateService::MILESTONES as $milestone => $spec) {
            if (in_array($milestone, $earnedKeys, true)) {
                continue;
            }

            $out[] = [
                'milestone' => $milestone,
                'name_key' => 'certificate.milestone.'.$milestone.'.title',
                'subtitle_key' => 'certificate.milestone.'.$milestone.'.subtitle',
                'threshold' => $spec['threshold'],
                'unit' => $spec['unit'],
                // Null progress means the count is not meaningful yet (e.g. a
                // streak that has already lapsed) rather than zero.
                'progress' => $this->progressFor($user, $milestone),
            ];
        }

        return $out;
    }

    /** How far along the member is, in the milestone's own unit. */
    private function progressFor(User $user, string $milestone): int
    {
        return match ($milestone) {
            Certificate::MILESTONE_SESSIONS => \App\Models\WorkoutSession::where('user_id', $user->id)
                ->whereNotNull('finished_at')->count(),

            Certificate::MILESTONE_STRENGTH => \App\Models\PersonalRecord::where('user_id', $user->id)->count(),

            /*
             * Consistency is judged on the member's BEST month, matching
             * CertificateService — if this measured the current month instead,
             * the progress bar and the award would disagree, and the bar would
             * reset to zero every month while the certificate stayed earned.
             */
            Certificate::MILESTONE_CONSISTENCY => (int) (\Illuminate\Support\Facades\DB::table('workout_sessions')
                ->where('user_id', $user->id)
                ->whereNotNull('finished_at')
                ->selectRaw("strftime('%Y-%m', finished_at) as ym, COUNT(*) as c")
                ->groupBy('ym')
                ->orderByDesc('c')
                ->value('c') ?? 0),

            // Streak progress needs the ladder walk, which the service owns.
            default => 0,
        };
    }
}
