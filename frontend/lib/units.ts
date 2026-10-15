/**
 * Weight units — the one place that knows how a stored kilogram becomes what
 * the member reads, and how what they type becomes a kilogram again.
 *
 * WHY THIS FILE EXISTS
 *
 * The API, the database, PR detection and every analytics aggregate are all in
 * kilograms. That is not a display preference, it is the storage contract: a
 * set's `weight_kg` column, a PR's `value`, and a goal's `target_value` are all
 * kilograms, and changing them would silently corrupt history the moment a
 * member switched units. So the unit choice is strictly a VIEW concern — it
 * lives here, and every conversion is a boundary crossing between "kg" and
 * "what the member sees".
 *
 * WHERE THE CHOICE LIVES
 *
 * `localStorage["user"].profile.preferences.unit` is the source of truth for
 * display; the server profile carries the same value so it follows the account
 * to another device. localStorage wins for rendering because it is the copy the
 * client already treats as authoritative for the signed-in session — the login
 * response, `/auth/user` hydration, and the profile-photo update all write it —
 * and reading it costs nothing, whereas reading the server would mean a request
 * per page before anything could be rendered in the right unit. The two are
 * written together by the Settings toggle (see `publishUnit`), and a fresh
 * login re-hydrates localStorage from the server, so they cannot drift for
 * long.
 *
 * Nothing here touches `window` at module scope: this module is imported by
 * client components that Next also renders on the server, so every browser
 * access is guarded.
 */

export type Unit = "kg" | "lbs";

/** Kilograms in one pound. The single definition of the conversion factor. */
export const KG_PER_LB = 2.20462;

/** The unit shown when nothing has been chosen — also the storage unit. */
export const DEFAULT_UNIT: Unit = "kg";

/**
 * Fired on `window` when the display unit changes.
 *
 * A DOM event rather than shared state for the same reason as
 * `LEVEL_UP_EVENT`/`USER_UPDATED_EVENT` in `lib/progression.ts`: the control
 * lives in Settings and the readers live in other subtrees, so lifting this
 * into context would mean threading a provider through every page just to carry
 * one string. The detail is `{ unit: Unit }` — carrying the value, not just a
 * notification, so a page still updates when localStorage could not be written.
 */
export const UNIT_CHANGED_EVENT = "striv:unit-changed";

/** The localStorage key holding the cached user object. */
const USER_STORAGE_KEY = "user";

export function isUnit(value: unknown): value is Unit {
  return value === "kg" || value === "lbs";
}

/** The member's chosen display unit, or kg when there is nothing to read. */
export function getUserUnit(): Unit {
  if (typeof window === "undefined") return DEFAULT_UNIT;

  try {
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) return DEFAULT_UNIT;

    const user = JSON.parse(stored);
    const pref = user?.profile?.preferences?.unit;

    return isUnit(pref) ? pref : DEFAULT_UNIT;
  } catch {
    // Malformed cache: kg is the storage unit, so it is always a safe answer.
    return DEFAULT_UNIT;
  }
}

/**
 * Record a unit change for the whole app: mirror it into the cached user, then
 * announce it.
 *
 * The cache is patched rather than overwritten so the other fields the app
 * reads from it (name, avatar, onboarding state) survive. When there is no
 * cached user the write is skipped — inventing a partial one would make
 * `readStoredUser()` report a user with no profile, which the dashboard reads
 * as "onboarding not finished" and answers with a redirect. The event is
 * dispatched either way, so the open pages still follow the choice.
 */
export function publishUnit(unit: Unit): void {
  if (typeof window === "undefined") return;

  try {
    const stored = window.localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      user.profile = {
        ...(user.profile ?? {}),
        preferences: { ...(user.profile?.preferences ?? {}), unit },
      };
      window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    }
  } catch {
    // Storage blocked or malformed — the event below still updates the UI.
  }

  window.dispatchEvent(new CustomEvent(UNIT_CHANGED_EVENT, { detail: { unit } }));
}

/**
 * Raw conversion, kg → display unit. Unrounded: callers that show a number
 * should use `toDisplayWeight`/`formatWeight`, which round to a precision a
 * member can actually type.
 */
export function convertWeight(kg: number, toUnit: Unit): number {
  return toUnit === "lbs" ? kg * KG_PER_LB : kg;
}

/**
 * Raw conversion, display unit → kg. Unrounded for the same reason as
 * `convertWeight`; use `toStoredKg` before sending a number to the API.
 */
export function convertToKg(value: number, fromUnit: Unit): number {
  return fromUnit === "lbs" ? value / KG_PER_LB : value;
}

/**
 * A stored kilogram as the number to show the member.
 *
 * Two decimals, which is finer than the 0.5 lb a member can actually select and
 * therefore never visibly rounds a typed value. Rounding here (rather than at
 * each call site) is what makes the input round trip stable: type "100.5" in
 * lbs, store it, read it back, and the field still says "100.5" instead of
 * "100.49999".
 */
export function toDisplayWeight(kg: number, unit: Unit): number {
  return Math.round(convertWeight(kg, unit) * 100) / 100;
}

/**
 * A number the member typed, as the kilogram value to store.
 *
 * Four decimals on the pound path — an order of magnitude finer than the two
 * decimals displayed — so a typed value survives the round trip without the
 * float noise (45.35923700000001) that a raw division produces. Kilograms pass
 * through untouched: re-rounding a value that is already in the storage unit
 * would edit data for no reason.
 */
export function toStoredKg(value: number, unit: Unit): number {
  if (unit !== "lbs") return value;
  return Math.round((value / KG_PER_LB) * 10000) / 10000;
}

/**
 * A single weight, as a number without its unit — "100.2", "80".
 *
 * Deliberately not abbreviated: these are PR values and set weights, where the
 * member wants to read the number they lifted, not a rounded-off "1.2k".
 * Callers render the unit next to it from the hook's `label`.
 */
export function formatWeight(kg: number, unit: Unit): string {
  const value = toDisplayWeight(kg, unit);

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A single weight with its unit — "100.2 lbs". */
export function formatWeightFull(kg: number, unit: Unit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}

/**
 * An aggregate volume, abbreviated once it gets long — "236.8k".
 *
 * Volume is a sum of weight × reps, so it runs to six figures where a single
 * weight runs to two; a stat card showing "236816" would be unreadable. Rounded
 * to a whole number below the threshold, because half a kilogram of volume is
 * not information.
 */
export function formatVolume(kg: number, unit: Unit): string {
  const value = toDisplayWeight(kg, unit);

  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";

  return String(Math.round(value));
}
