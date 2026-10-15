<?php

namespace App\Services\Training;

use App\Models\Routine;

/**
 * Renders a generated programme's coaching notes in the reader's language.
 *
 * The notes are built here, at read time, rather than saved with the routine.
 * That is what lets a member switch to Indonesian and see the notes follow,
 * and it means improving the wording later fixes every existing plan instead of
 * only new ones.
 *
 * A routine the trainer wrote by hand is returned untouched: that is authored
 * prose and must stay exactly as typed.
 */
class ProgramNotesRenderer
{
    /**
     * The notes for this routine as an ordered list of paragraphs.
     *
     * Returns an array rather than a blob so the client can render paragraphs
     * without parsing newlines, and so a caller could style them individually.
     *
     * @return array<int, string>
     */
    public function forRoutine(Routine $routine, ?string $locale = null): array
    {
        // Hand-written notes win, always.
        if (! $routine->auto_generated) {
            return $routine->notes !== null && trim($routine->notes) !== ''
                ? array_values(array_filter(preg_split('/\n{2,}/', trim($routine->notes)) ?: []))
                : [];
        }

        // No stored inputs (a plan generated before this existed): fall back to
        // whatever prose was saved rather than showing nothing.
        if ($routine->program_goal === null) {
            return $routine->notes !== null && trim($routine->notes) !== ''
                ? array_values(array_filter(preg_split('/\n{2,}/', trim($routine->notes)) ?: []))
                : [];
        }

        $original = app()->getLocale();

        if ($locale !== null) {
            app()->setLocale($locale);
        }

        try {
            $goal = $routine->program_goal;
            $experience = $routine->program_experience ?? 'beginner';
            $frequency = (int) ($routine->program_frequency ?? 3);

            $lines = [
                __('messages.program.note_goal_'.$goal),
                __('messages.program.note_experience_'.$experience),
                $frequency >= 5
                    ? __('messages.program.note_frequency_high', ['count' => $frequency])
                    : __('messages.program.note_frequency', ['count' => $frequency]),
                __('messages.program.note_review'),
            ];

            // Defensive: an unknown goal/experience would render a raw key like
            // "messages.program.note_goal_xyz". Drop those rather than show it.
            return array_values(array_filter(
                $lines,
                fn (string $line) => ! str_starts_with($line, 'messages.'),
            ));
        } finally {
            app()->setLocale($original);
        }
    }

    /** Same notes as one paragraph-per-line string, for channels that need text. */
    public function asText(Routine $routine, ?string $locale = null): string
    {
        return implode("\n\n", $this->forRoutine($routine, $locale));
    }
}
