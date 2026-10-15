"use client";

import {
  DEFAULT_UNIT,
  UNIT_CHANGED_EVENT,
  formatVolume as formatVolumeIn,
  formatWeight as formatWeightIn,
  formatWeightFull as formatWeightFullIn,
  getUserUnit,
  isUnit,
  toDisplayWeight,
  toStoredKg,
  type Unit,
} from "@/lib/units";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The member's display unit, plus the formatters that use it.
 *
 * All conversion logic lives in `lib/units.ts`; this hook is only the React
 * binding — it answers "which unit?" and re-renders when the answer changes.
 * Keeping the two apart matters because the settings page and the workout
 * editor also need to convert outside of a render, and they can import the
 * plain functions without pulling in a hook.
 *
 * WHERE THE ANSWER COMES FROM
 *
 * `localStorage["user"].profile.preferences.unit`, which is the source of truth
 * for display. The server holds the same value so the choice follows the
 * account, but reading the server would mean a request before a single weight
 * could be rendered in the right unit, and the login response already copies
 * the profile — including preferences — into localStorage. So the local copy is
 * the fast path and the server is the durable one; `publishUnit` writes both.
 *
 * HOW A CHANGE REACHES OTHER PAGES
 *
 * Through `UNIT_CHANGED_EVENT`, the same DOM-event idiom `lib/progression.ts`
 * uses for level-ups and profile-photo updates. The control lives in Settings
 * and the readers live in sibling subtrees, so shared state would mean a
 * provider wrapping the whole app to carry one string. The listener also
 * subscribes to the `storage` event, so a second tab follows along.
 *
 * SSR-SAFE: the first render is always kg, and the real value is adopted in an
 * effect. Reading localStorage during the initial render would produce markup
 * the server did not send, which React reports as a hydration mismatch. Every
 * caller of this hook fetches its numbers client-side, so the one-frame kg
 * default lands on a loading skeleton rather than on a wrong number.
 */
export function useUnit() {
  const [unit, setUnit] = useState<Unit>(DEFAULT_UNIT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnit(getUserUnit());
    setReady(true);

    const onUnitChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ unit?: unknown }>).detail;
      setUnit(isUnit(detail?.unit) ? detail.unit : getUserUnit());
    };

    // A change made in another tab arrives as a storage event, which carries no
    // detail — re-reading is the only way to learn what it now says.
    const onStorage = (event: StorageEvent) => {
      if (event.key === "user") setUnit(getUserUnit());
    };

    window.addEventListener(UNIT_CHANGED_EVENT, onUnitChanged);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(UNIT_CHANGED_EVENT, onUnitChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const convert = useCallback((kg: number) => toDisplayWeight(kg, unit), [unit]);
  const toStored = useCallback((value: number) => toStoredKg(value, unit), [unit]);
  const formatWeight = useCallback((kg: number) => formatWeightIn(kg, unit), [unit]);
  const formatWeightFull = useCallback((kg: number) => formatWeightFullIn(kg, unit), [unit]);
  const formatVolume = useCallback((kg: number) => formatVolumeIn(kg, unit), [unit]);

  return useMemo(
    () => ({
      unit,
      /**
       * False until the stored unit has been read on the client.
       *
       * The first render is always kg (see the SSR note above), so a consumer
       * that CONVERTS something — rather than just displaying a unit label —
       * has to wait for this before treating the unit as real. Rendering a
       * value is harmless either way; converting one on a wrong guess is not.
       */
      ready,
      /** "kg" or "lbs" — a unit symbol, identical in every locale. */
      label: unit,
      convert,
      toStored,
      formatWeight,
      formatWeightFull,
      formatVolume,
    }),
    [unit, ready, convert, toStored, formatWeight, formatWeightFull, formatVolume]
  );
}
