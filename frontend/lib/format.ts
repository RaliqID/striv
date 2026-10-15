/**
 * Shared number and duration formatting.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Two helpers had been copy-pasted across pages, and one pair had already
 * drifted apart:
 *
 *   formatDuration  — `app/history/page.tsx` rendered "5m" while
 *                     `app/workouts/[id]/page.tsx` rendered "5 min". The same
 *                     value read differently on two screens, which makes the app
 *                     feel inconsistent for no reason a member could explain.
 *
 *   formatVolume    — four identical copies (dashboard, progress,
 *                     reviews/weekly, workouts/[id]).
 *
 * Copy-paste is what allowed the drift, so the fix is one implementation rather
 * than two that agree today. This module is the single source; pages import from
 * here instead of defining their own.
 *
 * It deliberately has no imports of its own — it must stay usable from any page
 * without creating a dependency cycle, and it must not depend on the i18n
 * provider (these are numeric formats, not translated strings).
 */

/**
 * Minutes as a compact duration.
 *
 * `min` is the canonical unit here because it is what the rest of the app
 * already uses — the trainer screens render `~65 min` and the client list renders
 * `${n} min`. The one place that used a bare `m` was the outlier, not the
 * convention, so the majority won.
 *
 * Hours are collapsed only when they are whole or when minutes remain, so
 * "90" becomes "1h 30m" rather than "1.5h" — a member reading their own session
 * length thinks in hours and minutes, not decimal hours.
 *
 * A null duration means "not recorded", which is different from zero: a session
 * with no duration was not necessarily instant. It renders as an em dash so it
 * cannot be misread as a measurement.
 */
export function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null) return "—";

  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;

  return `${hours}h ${rest}m`;
}

/**
 * A volume figure in kilograms, abbreviated past a thousand.
 *
 * 453992 kg is unreadable inline, so it becomes "454.0k". Below a thousand the
 * exact number is shown, because that is the range where a member is comparing
 * individual sessions and the precision matters.
 *
 * The unit suffix is NOT included — callers append their own `kg`/`lbs` label,
 * because some of them are translating it and some are rendering a unit symbol.
 */
export function formatVolume(kg: number | null | undefined): string {
  if (kg == null) return "—";

  if (kg >= 1000) {
    return (kg / 1000).toFixed(1) + "k";
  }

  return Math.round(kg).toString();
}

/**
 * A volume figure with its unit, for places that want both.
 *
 * Separate from `formatVolume` because the two needs genuinely differ: a stat
 * card wants "454.0k" beside a small "kg" label it styles itself, while an
 * inline sentence wants "454.0k kg" as one string.
 */
export function formatVolumeWithUnit(kg: number | null | undefined, unit = "kg"): string {
  if (kg == null) return "—";

  return `${formatVolume(kg)} ${unit}`;
}
