"use client";

import { apiClient, ApiError, isTimeoutError } from "@/lib/api";
import type { Exercise } from "@/types/exercise";
import type { Paginated } from "@/types/exercise";
import type {
  WorkoutExercise,
  WorkoutSet,
  UiExercise,
  FinishResponse,
  SessionSummary,
} from "./types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import { toDisplayWeight, toStoredKg, type Unit } from "@/lib/units";
import PhotoCapture, { type CapturedPhoto } from "@/components/workout/PhotoCapture";
import WorkoutReward, { type Reward } from "@/components/workout/WorkoutReward";
import {
  LEVEL_UP_EVENT,
  type SessionXp,
  type UnlockedBadge,
} from "@/lib/progression";
import RestTimer from "@/components/workout/RestTimer";
import { setActiveWorkout, clearActiveWorkout } from "@/lib/active-workout";
import PlateCalculatorModal from "@/components/workout/PlateCalculatorModal";
import OneRmEstimatorPopover from "@/components/workout/OneRmEstimatorPopover";

/**
 * What the server said about a set's evidence.
 *
 * Held in component state keyed by set, because the verdict arrives with the
 * upload response and is needed to explain a refusal on that specific row.
 */
type PhotoVerdict = {
  accepted: boolean;
  verdict: string;
  analysis: string | null;
  /** True when no check could run, so the photo is unproven rather than confirmed. */
  unverified?: boolean;
};

/**
 * How long to wait for a photo verdict.
 *
 * The server runs a vision model to judge the photo, and that call has its own
 * ~45s ceiling before it gives up and marks the photo unverified. If the client
 * deadline were shorter than the server's, a slow-but-working verification would
 * be cut off mid-flight and look like a failed upload. 60s sits above the
 * server's own limit, so the two agree: the client only aborts once the server
 * has already stopped waiting. Bounded all the same — a truly stuck request is
 * ended and the row recovers instead of spinning forever.
 */
const PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function toInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

/**
 * Re-express a typed weight from one display unit in another.
 *
 * Used only when the unit changes while this screen is open. The value goes
 * through kg on the way — typed number → kg → the other unit — so the member's
 * input is preserved exactly rather than being reinterpreted as the new unit
 * (which is what would happen if the string were simply left in place: "100"
 * lbs would silently become 100 kg, a 2.2× error).
 *
 * A string that is not a number ("" while a field is being cleared) is returned
 * untouched.
 */
function convertInput(value: string, from: Unit, to: Unit): string {
  if (from === to) return value;

  const num = parseNum(value);
  if (num === null) return value;

  return toInput(toDisplayWeight(toStoredKg(num, from), to));
}

export default function ActiveWorkoutPage() {
  const { t, locale } = useTranslation();
  /*
   * The display unit for the weight columns.
   *
   * Set fields hold the number in THIS unit — what the member typed and what
   * they expect to read back — while every value crossing the API boundary is
   * kilograms. `toStoredKg` on the way out and `toDisplayWeight` on the way in
   * are the only places the two meet; see `persistSet` and `loadExercises`.
   */
  const { unit, ready, label, formatVolume } = useUnit();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [exercises, setExercises] = useState<UiExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  // The reward payload from the finish call. Null when the server could not
  // build one; the screen then falls back to the plain summary.
  const [reward, setReward] = useState<Reward | null>(null);
  // XP + badges ride alongside `reward` rather than being read back off the
  // finish response: the response object is only in scope inside handleFinish,
  // while the reward screen renders from state well outside it.
  const [sessionXp, setSessionXp] = useState<SessionXp | null>(null);
  const [unlockedBadges, setUnlockedBadges] = useState<UnlockedBadge[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDebounced, setPickerDebounced] = useState("");
  const [pickerResults, setPickerResults] = useState<Exercise[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [addingExerciseId, setAddingExerciseId] = useState<number | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // Timer state
  const [globalSeconds, setGlobalSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restTotalSeconds, setRestTotalSeconds] = useState<number>(90);
  const [restActive, setRestActive] = useState(false);
  const [restPaused, setRestPaused] = useState(false);
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const sessionStartedAtRef = useRef<string | null>(null);
  const startedLoadingRef = useRef(false);

  // Photo evidence. A set cannot be completed without a verified photo, so the
  // capture sheet is the gate in front of every tick.
  const [photoTarget, setPhotoTarget] = useState<{
    exerciseId: number;
    exerciseName: string;
    setId: number;
    key: string;
  } | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, PhotoVerdict>>({});

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // Plate Calculator modal state
  const [plateCalcTarget, setPlateCalcTarget] = useState<{
    exerciseId: number;
    exerciseName: string;
    setId: number;
    setIndex: number;
    weight: number;
  } | null>(null);

  // 1RM Estimator Popover state
  const [oneRmTarget, setOneRmTarget] = useState<{
    exerciseName: string;
    setIndex: number;
    weight: number;
    reps: number;
  } | null>(null);

  /**
   * The unit as of the latest render, for callbacks that outlive theirs.
   *
   * `loadExercises` and `persistSet` are memoised on `sessionId`, so they close
   * over whatever `unit` was when they were created. Reading it from a ref means
   * a response that arrives after the member switched units converts with the
   * unit that is current NOW, rather than writing a number in the old unit into
   * a field that is now labelled in the new one.
   */
  const unitRef = useRef<Unit>(unit);
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  // Read session id + bootstrap
  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? sessionStorage.getItem("activeSessionId") : null;
    const id = stored ? Number(stored) : null;
    if (id && Number.isFinite(id)) {
      setSessionId(id);
    } else {
      setSessionId(null);
      setLoading(false);
    }
  }, []);

  // Fetch session exercises + started_at
  const loadExercises = useCallback(async () => {
    if (sessionId == null) return;
    if (!startedLoadingRef.current) {
      startedLoadingRef.current = true;
      setLoading(true);
    }
    setError(null);
    try {
      const list = await apiClient.get<WorkoutExercise[]>(
        `/workout-sessions/${sessionId}/exercises`
      );
      setExercises(
        (list ?? []).map((we) => ({
          id: we.id,
          exerciseId: we.exercise_id,
          name: we.exercise?.name ?? t("workout.exerciseFallback"),
          sets: (we.sets ?? []).map((s) => ({
            id: s.id,
            setNumber: s.set_number,
            /*
             * INBOUND boundary: the server speaks kg, the field speaks the
             * member's unit. `unitRef` rather than the `unit` in scope so a
             * reload triggered from a stale callback still converts with the
             * unit that is current when the response lands.
             */
            kg: s.weight_kg == null ? "" : toInput(toDisplayWeight(s.weight_kg, unitRef.current)),
            reps: toInput(s.reps),
            saved: true,
          })),
        }))
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        // Stale session id (deleted, not yours, already finished). Clear and bounce to Lobby.
        sessionStorage.removeItem("activeSessionId");
        clearActiveWorkout();
        window.location.href = "/workout";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
    /*
     * `t` is a dependency because the catch above uses it for the fallback
     * message. It is a useCallback keyed on locale, so it is stable until the
     * language changes — at which point this callback is rebuilt and a later
     * failure reports in the new language rather than the original one.
     */
  }, [sessionId, t]);

  useEffect(() => {
    if (sessionId == null) return;
    /*
     * Wait for the stored unit before loading.
     *
     * `loadExercises` converts each set's weight into the display unit on the
     * way in, and until the hook has read localStorage that unit is the SSR
     * placeholder (kg). Fetching first would fill every field with the kg value
     * of a member who reads pounds, and the re-expression effect deliberately
     * does NOT fix that up — it only reacts to a genuine change, so a hydration
     * would otherwise be indistinguishable from one. One extra frame of skeleton
     * is a much cheaper price than every weight being wrong.
     */
    if (!ready) return;
    loadExercises();
    // Fetch session for started_at (timer). 404/403/401 are silent — loadExercises already handles session invalidation.
    apiClient
      .get<{ started_at: string }>(`/workout-sessions/${sessionId}`)
      .then((session) => {
        if (session?.started_at) sessionStartedAtRef.current = session.started_at;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
        }
      });
  }, [sessionId, ready, loadExercises, reloadKey]);

  // Global elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      const start = sessionStartedAtRef.current
        ? new Date(sessionStartedAtRef.current).getTime()
        : mountedAtRef.current;
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - start) / 1000)
      );
      setGlobalSeconds(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rest timer handlers
  const startRest = useCallback((seconds = 90) => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTotalSeconds(seconds);
    setRestSeconds(seconds);
    setRestActive(true);
    setRestPaused(false);

    restIntervalRef.current = setInterval(() => {
      setRestSeconds((prev) => {
        if (prev === null || prev <= 0) return null;
        return prev - 1;
      });
    }, 1000);
  }, []);

  const closeRest = useCallback(() => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = null;
    setRestActive(false);
    setRestPaused(false);
    setRestSeconds(null);
  }, []);

  const skipRest = useCallback(() => {
    closeRest();
  }, [closeRest]);

  const setPresetSeconds = useCallback(
    (sec: number) => {
      setRestTotalSeconds(sec);
      setRestSeconds(sec);
      if (!restActive) {
        startRest(sec);
      }
    },
    [restActive, startRest]
  );

  const addRestSeconds = useCallback((delta: number) => {
    setRestSeconds((prev) => {
      const current = prev ?? 0;
      const next = Math.max(0, current + delta);
      return next === 0 ? null : next;
    });
    setRestTotalSeconds((prev) => Math.max(15, prev + delta));
  }, []);

  const toggleRestPause = useCallback(() => {
    setRestPaused((paused) => {
      const next = !paused;
      if (next) {
        if (restIntervalRef.current) {
          clearInterval(restIntervalRef.current);
          restIntervalRef.current = null;
        }
      } else {
        if (restIntervalRef.current) clearInterval(restIntervalRef.current);
        restIntervalRef.current = setInterval(() => {
          setRestSeconds((prev) => {
            if (prev === null || prev <= 0) return null;
            return prev - 1;
          });
        }, 1000);
      }
      return next;
    });
  }, []);

  /**
   * Retire the rest timer once countdown reaches zero (after brief chime window).
   */
  useEffect(() => {
    if (restSeconds === 0) {
      const timeout = setTimeout(() => {
        closeRest();
      }, 1200);
      return () => clearTimeout(timeout);
    }
    if (restSeconds === null && restActive) {
      closeRest();
    }
  }, [restSeconds, restActive, closeRest]);

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

  // Sync session state to storage for persistent floating mini-drawer
  useEffect(() => {
    if (!sessionId) return;
    const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const workoutName =
      exercises.length > 0
        ? exercises.map((e) => e.name).slice(0, 2).join(", ") +
          (exercises.length > 2 ? ` +${exercises.length - 2}` : "")
        : "Workout Session";

    setActiveWorkout({
      sessionId,
      name: workoutName,
      startedAt: sessionStartedAtRef.current || new Date(mountedAtRef.current).toISOString(),
      completedSetsCount: completedSets.size,
      totalSetsCount: totalSets,
      exerciseCount: exercises.length,
      lastUpdated: Date.now(),
    });
  }, [sessionId, exercises, completedSets]);

  // Debounce picker search
  useEffect(() => {
    const timer = setTimeout(() => setPickerDebounced(pickerSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [pickerSearch]);

  const searchExercises = useCallback(async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const params = new URLSearchParams();
      if (pickerDebounced) params.set("search", pickerDebounced);
      const response = await apiClient.get<Paginated<Exercise>>(
        `/exercises?${params.toString()}`
      );
      setPickerResults(response?.data ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setPickerError(t("common.loadFailed"));
    } finally {
      setPickerLoading(false);
    }
    /*
     * `t` is a dependency because the catch above uses it for the fallback
     * message. It is a useCallback keyed on locale, so it is stable until the
     * language changes — at which point this callback is rebuilt and a later
     * failure reports in the new language rather than the original one.
     */
  }, [pickerDebounced, t]);

  useEffect(() => {
    if (!pickerOpen) return;
    searchExercises();
  }, [pickerOpen, searchExercises]);

  // Mutations

  const addExerciseToSession = async (exerciseId: number) => {
    if (sessionId == null) return;
    setAddingExerciseId(exerciseId);
    setPickerError(null);
    try {
      await apiClient.post<WorkoutExercise>(
        `/workout-sessions/${sessionId}/exercises`,
        { exercise_id: exerciseId }
      );
      setPickerOpen(false);
      setPickerSearch("");
      await loadExercises();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setPickerError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setAddingExerciseId(null);
    }
  };

  const removeExercise = async (workoutExerciseId: number) => {
    if (sessionId == null) return;
    setOpenMenuId(null);
    const snapshot = exercises;
    setExercises((prev) => prev.filter((ex) => ex.id !== workoutExerciseId));
    try {
      await apiClient.delete(
        `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}`
      );
    } catch (err) {
      setExercises(snapshot); // restore on failure
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    }
  };

  const addSet = async (workoutExerciseId: number) => {
    if (sessionId == null) return;
    try {
      const created = await apiClient.post<WorkoutSet>(
        `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets`,
        {}
      );
      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === workoutExerciseId
            ? {
                ...ex,
                sets: [
                  ...ex.sets,
                  {
                    id: created.id,
                    setNumber: created.set_number,
                    kg: "",
                    reps: "",
                    saved: true,
                  },
                ],
              }
            : ex
        )
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    }
  };

  const deleteSet = async (workoutExerciseId: number, setId: number) => {
    if (sessionId == null) return;
    const exBefore = exercises.find((ex) => ex.id === workoutExerciseId);
    const snapshot = exBefore ? [...exBefore.sets] : null;
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === workoutExerciseId
          ? { ...ex, sets: ex.sets.filter((s) => s.id !== setId) }
          : ex
      )
    );
    setCompletedSets((prev) => {
      const next = new Set(prev);
      next.delete(`${workoutExerciseId}:${setId}`);
      return next;
    });
    try {
      await apiClient.delete(
        `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`
      );
    } catch (err) {
      if (snapshot) {
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === workoutExerciseId ? { ...ex, sets: snapshot } : ex
          )
        );
      }
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    }
  };

  // Update set fields (debounced PUT 500ms, only when changed)
  const updateSetTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const lastSavedValues = useRef<Map<string, { kg: string; reps: string }>>(
    new Map()
  );

  /**
   * Send one set's weight and reps to the server.
   *
   * `fromUnit` is the unit the two strings are expressed in. It is a parameter
   * rather than read from `unitRef` inside, because the one caller that flushes
   * a queued save during a unit change is holding strings in the unit that was
   * active when they were typed — which is no longer the current one. Passing
   * it makes each conversion say what it is converting from, so the boundary
   * cannot be crossed with the wrong factor.
   */
  const persistSet = useCallback(
    async (
      workoutExerciseId: number,
      setId: number,
      kg: string,
      reps: string,
      fromUnit: Unit
    ) => {
      if (sessionId == null) return;
      /*
       * OUTBOUND boundary: the field holds the member's unit, the API only
       * understands kilograms. `toStoredKg` is applied here and nowhere else, so
       * there is exactly one place where a typed weight becomes stored data —
       * which is what keeps the column, PR detection and every analytics
       * aggregate in kg regardless of what the member is reading.
       */
      const typed = parseNum(kg);
      const weightKg = typed === null ? null : toStoredKg(typed, fromUnit);

      try {
        const updated = await apiClient.put<WorkoutSet>(
          `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`,
          { weight_kg: weightKg, reps: parseNum(reps) }
        );
        /*
         * The response is the server's kg value echoed back, so it is converted
         * for display before it replaces what the member typed. Taking it
         * verbatim would turn a field reading "100" (lbs) into "45.36" the
         * moment the debounced save returned — the number would appear to change
         * under them.
         *
         * Converted with the CURRENT unit, not `fromUnit`: the request may have
         * been in flight when the member switched, and what belongs in the field
         * now is the value in whatever unit the field is displaying now. The
         * underlying kilograms are the same either way.
         */
        const shownKg =
          updated?.weight_kg == null
            ? ""
            : toInput(toDisplayWeight(updated.weight_kg, unitRef.current));

        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === workoutExerciseId
              ? {
                  ...ex,
                  sets: ex.sets.map((s) =>
                    s.id === setId
                      ? { ...s, saved: true, kg: shownKg, reps: toInput(updated?.reps) }
                      : s
                  ),
                }
              : ex
          )
        );
        const key = `${workoutExerciseId}:${setId}`;
        lastSavedValues.current.set(key, { kg: shownKg, reps: toInput(updated?.reps) });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
      }
    },
    /*
     * `t` is a dependency because the catch above uses it for the fallback
     * message. It is a useCallback keyed on locale, so it is stable until the
     * language changes — at which point this callback is rebuilt and a later
     * failure reports in the new language rather than the original one.
     */
    [sessionId, t]
  );

  const updateSetField = (
    workoutExerciseId: number,
    setId: number,
    field: "kg" | "reps",
    value: string
  ) => {
    const key = `${workoutExerciseId}:${setId}`;
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === workoutExerciseId
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.id === setId ? { ...s, [field]: value, saved: false } : s
              ),
            }
          : ex
      )
    );
    const existing = updateSetTimers.current.get(key);
    if (existing) clearTimeout(existing);
    updateSetTimers.current.set(
      key,
      setTimeout(() => {
        updateSetTimers.current.delete(key);
        const ex = exercisesRef.current.find((e) => e.id === workoutExerciseId);
        const set = ex?.sets.find((s) => s.id === setId);
        if (!set) return;
        const last = lastSavedValues.current.get(key);
        if (last && last.kg === set.kg && last.reps === set.reps) return; // unchanged
        // The typed strings are in the unit the field is currently showing.
        persistSet(workoutExerciseId, setId, set.kg, set.reps, unitRef.current);
      }, 500)
    );
  };

  const handleApplyPlateWeight = (appliedWeight: number) => {
    if (!plateCalcTarget) return;
    updateSetField(plateCalcTarget.exerciseId, plateCalcTarget.setId, "kg", String(appliedWeight));
  };

  // Ref mirror for debounce closures
  const exercisesRef = useRef<UiExercise[]>([]);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  /**
   * Re-express the weight fields when the unit changes mid-session.
   *
   * The fields hold a number in the unit that was active when it was typed, so
   * a switch would otherwise leave "100" sitting under a column that now says
   * "lbs" — the same number, meaning 100 kg before the switch and 100 lbs after
   * it. Re-labelling without re-expressing silently rewrites the member's
   * intent, which on a weight field is a 2.2× error.
   *
   * A save that was already queued is flushed FIRST (its timer is cleared and
   * `persistSet` is called directly) so the value is committed to the server in
   * the unit it was typed in. Converting the field and then letting the stale
   * timer fire would send the converted number as though it were the original.
   *
   * `null` means "no baseline recorded yet". The first real unit only becomes
   * the baseline — it does not trigger a conversion — because the hook's first
   * render is the SSR placeholder (kg), and treating the read of the stored
   * value as a switch would convert every field the moment the page hydrated.
   */
  const previousUnitRef = useRef<Unit | null>(null);
  useEffect(() => {
    if (!ready) return;

    const previous = previousUnitRef.current;
    previousUnitRef.current = unit;
    if (previous === null || previous === unit) return;

    // Flush pending saves in the old unit before re-expressing anything.
    for (const [key, timer] of updateSetTimers.current) {
      clearTimeout(timer);
      updateSetTimers.current.delete(key);
      const [exerciseId, setId] = key.split(":").map(Number);
      const set = exercisesRef.current
        .find((e) => e.id === exerciseId)
        ?.sets.find((s) => s.id === setId);
      if (!set) continue;
      const last = lastSavedValues.current.get(key);
      if (last && last.kg === set.kg && last.reps === set.reps) continue;
      // These strings are still in the OLD unit — that is the whole reason this
      // runs before the re-expression below.
      void persistSet(exerciseId, setId, set.kg, set.reps, previous);
    }

    setExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.kg === "" ? s : { ...s, kg: convertInput(s.kg, previous, unit) }
        ),
      }))
    );

    /*
     * Keep the saved-value markers in the new unit too.
     *
     * They answer "is what the field shows already on the server?". The
     * re-expression above changes the string without changing the stored
     * kilograms, so leaving the old strings behind would make every field look
     * unsaved and re-PUT values that never changed.
     */
    for (const [key, last] of lastSavedValues.current) {
      if (last.kg === "") continue;
      lastSavedValues.current.set(key, {
        ...last,
        kg: convertInput(last.kg, previous, unit),
      });
    }
  }, [unit, ready, persistSet]);

  /**
   * Ticking a set opens the camera.
   *
   * A set is only completed by evidence, so the tick does not change state
   * itself — it opens the capture sheet, and `submitPhoto` does the real work.
   *
   * Unticking removes the evidence server-side and clears the tick. That is
   * deliberate rather than a local toggle: leaving the photo attached to a set
   * that is no longer claimed as done would let the record say both things at
   * once.
   */
  const toggleSet = (workoutExerciseId: number, setId: number, exerciseName: string) => {
    const key = `${workoutExerciseId}:${setId}`;

    if (completedSets.has(key)) {
      void removePhoto(workoutExerciseId, setId, key);

      return;
    }

    // Ticking a new set while resting is refused. The rest timer is a lock, not
    // a decoration: without this a member could log three sets within seconds.
    if (restActive) {
      return;
    }

    setPhotoTarget({ exerciseId: workoutExerciseId, exerciseName, setId, key });
  };

  /** Upload the captured photo; the server decides whether the set completes. */
  const submitPhoto = async (photo: CapturedPhoto) => {
    if (sessionId === null || photoTarget === null) return;

    const { exerciseId, setId, key } = photoTarget;
    setUploadingKey(key);
    setPhotoTarget(null);

    try {
      const res = await apiClient.post<PhotoVerdict>(
        `/workout-sessions/${sessionId}/sets/${setId}/photo`,
        { image: photo.dataUrl, mime: photo.mime },
        { timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS }
      );

      // Accepted: the server already marked the set complete.
      setCompletedSets((prev) => new Set(prev).add(key));
      setVerdicts((prev) => ({ ...prev, [key]: res }));
      startRest(restTotalSeconds || 90);
    } catch (err) {
      /*
       * A rejected photo comes back as 422 with the verdict in the body, which
       * is information the member needs: the AI's own description of what it
       * saw is what tells them what to retake. A generic "failed" would leave
       * them retaking the same wrong shot.
       */
      const details =
        err instanceof ApiError && err.status === 422
          ? (err.details as Partial<PhotoVerdict> | undefined)
          : undefined;

      /*
       * A timeout is our own deadline firing, not a verdict from the server, so
       * it has no `analysis` to show. Give the member the translated "took too
       * long" line rather than the raw English message the helper threw with.
       */
      const fallbackMessage = isTimeoutError(err)
        ? t("common.requestTimeout")
        : err instanceof ApiError
          ? err.message
          : t("common.actionFailed");

      setVerdicts((prev) => ({
        ...prev,
        [key]: {
          accepted: false,
          verdict: details?.verdict ?? "rejected",
          analysis: details?.analysis ?? fallbackMessage,
        },
      }));
    } finally {
      setUploadingKey(null);
      void exerciseId;
    }
  };

  /** Remove a set's evidence and clear its tick. */
  const removePhoto = async (workoutExerciseId: number, setId: number, key: string) => {
    if (sessionId === null) return;

    try {
      await apiClient.delete(`/workout-sessions/${sessionId}/sets/${setId}/photo`);
    } catch {
      // Already gone is fine; the local state still needs clearing.
    }

    setCompletedSets((prev) => {
      const next = new Set(prev);
      next.delete(key);

      return next;
    });
    setVerdicts((prev) => {
      const next = { ...prev };
      delete next[key];

      return next;
    });
    void workoutExerciseId;
  };

  const handleFinish = async () => {
    if (sessionId == null || finishing) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const response = await apiClient.post<FinishResponse>(
        `/workout-sessions/${sessionId}/finish`,
        {}
      );
      sessionStorage.removeItem("activeSessionId");
      clearActiveWorkout();
      setSummary(
        response?.summary ?? {
          exercises: exercises.length,
          sets: exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
          volume_kg: 0,
        }
      );
      setSummaryDate(response?.session?.finished_at ?? new Date().toISOString());
      setReward(response?.reward ?? null);
      setSessionXp(response?.xp ?? null);
      setUnlockedBadges(response?.achievements_unlocked ?? null);

      // Level-up is a whole-app moment, not a page-local one: the layout has to
      // paint an overlay above everything. A window event hands it off without
      // prop-drilling level state through every page that does not care. Fired
      // AFTER the state above so the reward screen is already mounted behind the
      // overlay when it appears.
      const xp = response?.xp;
      if (xp?.leveled_up) {
        window.dispatchEvent(
          new CustomEvent(LEVEL_UP_EVENT, {
            detail: { level: xp.progress.level, progression: xp.progress },
          })
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setFinishError(
        err instanceof ApiError ? err.message : t("common.actionFailed")
      );
    } finally {
      setFinishing(false);
    }
  };

  // Screens

  if (summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-container-lowest px-margin-mobile py-12 text-on-surface md:px-margin-desktop">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8">
          {/*
            The reward screen when the server returned one; the plain summary
            otherwise. The fallback stays because the reward payload is optional
            — a member must always see their session result.
          */}
          {reward ? (
            <WorkoutReward reward={reward} xp={sessionXp} badges={unlockedBadges} />
          ) : (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary-fixed">
                <span className="material-symbols-outlined text-[40px] text-on-secondary-fixed">
                  emoji_events
                </span>
              </div>
              <h1 className="text-center font-headline-lg text-headline-lg tracking-tight text-primary">
                {t("workout.complete")}
              </h1>
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface p-6">
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {t("nav.exercises")}
                  </span>
                  <span className="font-metric-display text-metric-display text-primary">
                    {summary.exercises}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface p-6">
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {t("progress.sets")}
                  </span>
                  <span className="font-metric-display text-metric-display text-primary">
                    {summary.sets}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface p-6">
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {t("progress.volume")}
                  </span>
                  <span className="font-metric-display text-metric-display text-primary">
                    {formatVolume(summary.volume_kg)}
                    {/* A real space, not a margin: a margin leaves textContent
                        as "11750kg", which is what a screen reader reads out. */}
                    {" "}
                    <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                      {label}
                    </span>
                  </span>
                </div>
              </div>
            </>
          )}

          {summaryDate && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {new Date(summaryDate).toLocaleString(locale, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {finishError && (
            <p className="text-error font-body-md text-sm" role="alert">{finishError}</p>
          )}
          <Link
            href="/dashboard"
            className="bg-primary text-on-primary px-8 py-4 rounded font-metric-sm text-metric-sm hover:bg-primary-hover transition-colors"
          >
            {t("workout.backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  if (sessionId == null && !loading) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center px-margin-mobile md:px-margin-desktop">
        <div className="flex flex-col items-center gap-3 text-center border border-outline-variant rounded-xl bg-surface p-12 max-w-md">
          <span className="material-symbols-outlined text-outline text-[48px]">
            fitness_center
          </span>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
            {t("workout.noActiveSession")}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t("workout.startFromLobby")}
          </p>
          <Link
            href="/workout"
            className="mt-4 rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
          >
            {t("workout.goToLobby")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col">
      <header className="flex items-center justify-between px-margin-mobile md:px-margin-desktop py-4 border-b border-outline-variant bg-surface-container-lowest z-40 shrink-0">
        <Link
          href="/workout"
          aria-label={t("workout.minimize")}
          className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[24px]">expand_more</span>
        </Link>
        <div className="flex flex-col items-center min-w-0">
          <h1 className="font-metric-sm text-metric-sm">{t("nav.workout")}</h1>
          <div className="flex items-center gap-1 text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span className="font-label-caps text-label-caps tracking-widest tabular-nums">
              {formatTime(globalSeconds)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!restActive) startRest(restTotalSeconds || 90);
              else setRestActive(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-outline-variant hover:bg-surface-container transition-colors text-primary text-xs font-semibold"
            title={t("workout.restTimer")}
          >
            <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
            <span className="hidden sm:inline">{t("workout.restTimer")}</span>
          </button>

          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-full font-metric-sm text-metric-sm hover:bg-on-surface-variant transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {finishing ? t("workout.finishing") : t("workout.finish")}
          </button>
        </div>
      </header>

      {finishError && (
        <div
          className="mx-margin-mobile md:mx-margin-desktop mt-4 max-w-[800px] w-full flex items-center justify-between gap-4 bg-error-container text-on-error-container rounded-lg px-4 py-3"
          role="alert"
        >
          <span className="font-body-md text-sm">{finishError}</span>
          <button
            type="button"
            aria-label={t("action.dismiss")}
            onClick={() => setFinishError(null)}
            className="shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto w-full px-margin-mobile md:px-margin-desktop py-8 pb-32">
        <div className="max-w-[800px] mx-auto flex flex-col gap-8">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-56 rounded-xl bg-surface-container"
              />
            ))
          ) : error && exercises.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="font-body-md text-body-md text-on-surface">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
              >
                {t("action.retry")}
              </button>
            </div>
          ) : (
            <>
              {error && exercises.length > 0 && (
                <p className="text-error font-body-md text-sm" role="alert">
                  {error}
                </p>
              )}
              {exercises.map((exercise) => {
                const setCount = exercise.sets.length;
                return (
                  <section
                    key={exercise.id}
                    className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
                  >
                    <div className="px-6 py-5 border-b border-outline-variant flex justify-between items-start bg-surface relative">
                      <div>
                        <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg tracking-tight">
                          {exercise.name}
                        </h2>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                          {setCount} {setCount === 1 ? t("workout.setSingular") : t("workout.setPlural")}
                        </p>
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={t("workout.optionsAria", { name: exercise.name })}
                          className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-variant"
                          onClick={() =>
                            setOpenMenuId(openMenuId === exercise.id ? null : exercise.id)
                          }
                        >
                          <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                        {openMenuId === exercise.id && (
                          <div className="absolute right-0 top-full mt-1 bg-surface border border-outline-variant rounded-lg shadow-lg z-20 w-44 overflow-hidden">
                            {exercise.sets.map((set, idx) => (
                              <button
                                key={set.id}
                                type="button"
                                className="w-full text-left px-4 py-2 font-body-md text-sm text-error hover:bg-surface-container-low transition-colors flex items-center gap-2"
                                onClick={() => deleteSet(exercise.id, set.id)}
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  delete
                                </span>
                                {t("workout.deleteSet", { n: idx + 1 })}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="w-full text-left px-4 py-2 font-body-md text-sm text-error hover:bg-surface-container-low transition-colors flex items-center gap-2 border-t border-outline-variant"
                              onClick={() => removeExercise(exercise.id)}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                delete_forever
                              </span>
                              {t("workout.removeExercise")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-surface-container-low/50 border-b border-outline-variant">
                      <div className="col-span-2 text-center font-label-caps text-label-caps text-on-surface-variant">{t("workout.colSet")}</div>
                      <div className="col-span-4 text-center font-label-caps text-label-caps text-on-surface-variant">{t("workout.colWeight", { unit: label })}</div>
                      <div className="col-span-4 text-center font-label-caps text-label-caps text-on-surface-variant">{t("client.repsUpper")}</div>
                      <div className="col-span-2 text-center font-label-caps text-label-caps text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      {exercise.sets.map((set, setIdx) => {
                        const completed = completedSets.has(`${exercise.id}:${set.id}`);
                        const rowKey = `${exercise.id}:${set.id}`;
                        const isUploading = uploadingKey === rowKey;
                        // Only shown for a REFUSED photo: an accepted one needs
                        // no explanation, and clutter on every row would train
                        // the member to ignore the message that matters.
                        const verdict = verdicts[rowKey];
                        const showVerdict = verdict !== undefined && !verdict.accepted;
                        // A photo that could not be checked is saved but unproven: amber,
                        // not red, because nothing was refused and the member did
                        // nothing wrong.
                        const showUnverified = verdict !== undefined && verdict.accepted && verdict.unverified === true;

                        const numWeight = parseFloat(set.kg);
                        const numReps = parseInt(set.reps, 10);
                        const hasValidWeight = Number.isFinite(numWeight) && numWeight > 0;
                        const hasValidReps = Number.isFinite(numReps) && numReps > 0;

                        let est1rmDisplay: string | null = null;
                        if (hasValidWeight && hasValidReps) {
                          if (numReps === 1) {
                            est1rmDisplay = `${numWeight} ${label}`;
                          } else if (numReps > 1 && numReps <= 15) {
                            const e = numWeight * (1 + numReps / 30);
                            const b = numWeight * (36 / (37 - numReps));
                            const avg = Math.round(((e + b) / 2) * 10) / 10;
                            est1rmDisplay = `${avg} ${label}`;
                          }
                        }

                        return (
                          <div
                            key={set.id}
                            className={`set-row grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-outline-variant/50 last:border-b-0 group ${
                              completed ? "completed opacity-70 bg-surface-container-low" : ""
                            }`}
                          >
                            <div className="col-span-2 flex justify-center">
                              <span className="font-metric-sm text-metric-sm bg-surface-variant w-8 h-8 rounded-full flex items-center justify-center">
                                {setIdx + 1}
                              </span>
                            </div>
                            <div className="col-span-4">
                              <input
                                className={`w-full h-12 bg-surface text-center font-metric-sm text-metric-sm border rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm ${
                                  set.saved ? "border-outline-variant" : "border-secondary"
                                }`}
                                type="number"
                                inputMode="decimal"
                                placeholder="-"
                                value={set.kg}
                                aria-label={t("workout.setWeightAria", { n: setIdx + 1, unit: label })}
                                onChange={(e) =>
                                  updateSetField(exercise.id, set.id, "kg", e.target.value)
                                }
                                readOnly={completed}
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                className={`w-full h-12 bg-surface text-center font-metric-sm text-metric-sm border rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm ${
                                  set.saved ? "border-outline-variant" : "border-secondary"
                                }`}
                                type="number"
                                inputMode="numeric"
                                placeholder="-"
                                value={set.reps}
                                aria-label={t("workout.setRepsAria", { n: setIdx + 1 })}
                                onChange={(e) =>
                                  updateSetField(exercise.id, set.id, "reps", e.target.value)
                                }
                                readOnly={completed}
                              />
                            </div>
                            <div className="col-span-2 flex justify-center">
                              {/*
                                The tick opens the camera. A set is only completed
                                by a photo the server verified against this
                                exercise, so this is a claim-submission button
                                rather than a local toggle.

                                Locked while resting, and while an upload is in
                                flight, so the same set cannot be submitted twice.
                              */}
                              <button
                                type="button"
                                aria-label={t("photo.markSet")}
                                aria-disabled={!completed && restActive}
                                disabled={(!completed && restActive) || isUploading}
                                title={
                                  !completed && restActive
                                    ? t("workout.restLocked")
                                    : completed
                                      ? t("photo.removePhoto")
                                      : t("photo.markSet")
                                }
                                className={`set-toggle w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  completed
                                    ? "border-primary bg-primary text-on-primary"
                                    : isUploading
                                      ? "border-primary text-primary bg-surface"
                                      : restActive
                                        ? "cursor-not-allowed border-outline-variant/50 bg-surface-container text-transparent opacity-50"
                                        : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary bg-surface"
                                }`}
                                onClick={() => toggleSet(exercise.id, set.id, exercise.name)}
                              >
                                <span className="material-symbols-outlined">
                                  {isUploading
                                    ? "progress_activity"
                                    : completed
                                      ? "check"
                                      : restActive
                                        ? "lock"
                                        : "photo_camera"}
                                </span>
                              </button>
                            </div>

                            {/* Accessory row: Olympic Plate Calculator trigger + Real-time 1RM estimator pill */}
                            <div className="col-span-12 -mt-1 pt-1 flex items-center justify-between flex-wrap gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() =>
                                  setPlateCalcTarget({
                                    exerciseId: exercise.id,
                                    exerciseName: exercise.name,
                                    setId: set.id,
                                    setIndex: setIdx,
                                    weight: hasValidWeight ? numWeight : 0,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors border border-outline-variant/60"
                                title="Open Olympic Barbell Plate Calculator"
                              >
                                <span className="material-symbols-outlined text-[15px] text-secondary">
                                  calculate
                                </span>
                                <span>Plates</span>
                                {hasValidWeight && (
                                  <span className="text-on-surface-variant/70 text-[10px]">
                                    ({Math.max(0, Math.round(((numWeight - (unit === "lbs" ? 45 : 20)) / 2) * 10) / 10)} {label}/side)
                                  </span>
                                )}
                              </button>

                              {est1rmDisplay != null && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOneRmTarget({
                                      exerciseName: exercise.name,
                                      setIndex: setIdx,
                                      weight: numWeight,
                                      reps: numReps,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 transition-all hover:scale-[1.02]"
                                  title="View 1RM calculation & training intensity zones"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    trending_up
                                  </span>
                                  <span>Est. 1RM: {est1rmDisplay}</span>
                                </button>
                              )}
                            </div>

                            {/*
                              Why the photo was refused, shown on the row it
                              belongs to. The AI's own description is included:
                              "we could not see a gym" is far more useful than a
                              generic "invalid photo", and it tells an honest
                              member what to retake.
                            */}
                            {showVerdict && (
                              <div className="col-span-12 mt-2 rounded-lg bg-error-container px-3 py-2">
                                <p className="flex items-start gap-2 font-body-md text-[13px] text-on-error-container">
                                  <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
                                    report
                                  </span>
                                  <span>
                                    {t("photo.rejectedShort")}
                                    {verdict.analysis ? ` ${verdict.analysis}` : ""}
                                  </span>
                                </p>
                              </div>
                            )}

                            {/*
                              Amber, not red: the set counts and the member did
                              nothing wrong, but no check ran — so the claim is
                              recorded as unproven and the trainer is told.
                            */}
                            {showUnverified && (
                              <div className="col-span-12 mt-2 rounded-lg bg-tertiary-container px-3 py-2">
                                <p className="flex items-start gap-2 font-body-md text-[13px] text-on-tertiary-container">
                                  <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
                                    pending
                                  </span>
                                  <span>{t("photo.unverifiedShort")}</span>
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="w-full py-4 flex items-center justify-center gap-2 font-metric-sm text-metric-sm text-on-surface-variant hover:text-primary bg-surface hover:bg-surface-container-low transition-colors border-t border-outline-variant"
                      onClick={() => addSet(exercise.id)}
                    >
                      <span className="material-symbols-outlined text-[20px]">add</span>
                      {t("workout.addSet")}
                    </button>
                  </section>
                );
              })}

              <button
                type="button"
                className="w-full border-2 border-dashed border-outline-variant rounded-xl py-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary hover:bg-surface-container-low transition-all"
                onClick={() => setPickerOpen(true)}
              >
                <span className="material-symbols-outlined text-[32px]">add_circle</span>
                <span className="font-metric-sm text-metric-sm">{t("routines.addExercise")}</span>
              </button>
            </>
          )}
        </div>
      </main>

      {/* Exercise Picker Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("workout.addExercise")}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-surface rounded-xl border border-outline-variant p-6 w-full max-w-md max-h-[70vh] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                {t("routines.addExercise")}
              </h2>
              <button
                type="button"
                aria-label={t("action.close")}
                className="w-10 h-10 rounded-full hover:bg-surface-variant flex items-center justify-center text-on-surface-variant"
                onClick={() => setPickerOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                search
              </span>
              <input
                type="text"
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder={t("exercises.searchPlaceholder")}
                aria-label={t("exercises.searchPlaceholder")}
                className="w-full rounded-xl bg-surface-container-low border border-outline-variant pl-10 pr-4 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-1 focus:ring-outline transition"
              />
            </div>
            {pickerError && (
              <p className="text-error font-body-md text-sm" role="alert">{pickerError}</p>
            )}
            <div className="overflow-y-auto flex flex-col gap-2">
              {pickerLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse h-14 rounded-lg bg-surface-container" />
                ))
              ) : pickerResults.length === 0 ? (
                <p className="font-body-md text-sm text-on-surface-variant text-center py-8">
                  {t("exercises.empty")}
                </p>
              ) : (
                pickerResults.map((exercise) => {
                  const meta = [exercise.category, exercise.equipment]
                    .filter(Boolean)
                    .join(" • ");
                  const busy = addingExerciseId === exercise.id;
                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      disabled={busy || addingExerciseId !== null}
                      onClick={() => addExerciseToSession(exercise.id)}
                      className="w-full text-left border border-outline-variant rounded-lg p-4 hover:border-primary hover:bg-surface-container-low transition-colors disabled:opacity-50"
                    >
                      <span className="font-metric-sm text-metric-sm text-primary block">
                        {exercise.name}
                      </span>
                      {meta && (
                        <span className="font-body-md text-sm text-on-surface-variant">
                          {meta}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rest Timer Widget */}
      <RestTimer
        active={restActive}
        secondsRemaining={restSeconds}
        totalSeconds={restTotalSeconds}
        onClose={closeRest}
        onSkip={skipRest}
        onSetSeconds={setPresetSeconds}
        onAddSeconds={addRestSeconds}
        isPaused={restPaused}
        onTogglePause={toggleRestPause}
      />

      {/*
        The camera sheet. Opened by the tick on a set, and the only path by which
        a set can be completed — there is no local checkbox any more.
      */}
      <PhotoCapture
        open={photoTarget !== null}
        exerciseName={photoTarget?.exerciseName ?? ""}
        onCapture={submitPhoto}
        onCancel={() => setPhotoTarget(null)}
      />

      {/* Olympic Barbell Plate Calculator Modal */}
      <PlateCalculatorModal
        open={plateCalcTarget !== null}
        onClose={() => setPlateCalcTarget(null)}
        initialWeight={plateCalcTarget?.weight ?? 0}
        initialUnit={unit}
        onApplyWeight={handleApplyPlateWeight}
        exerciseName={plateCalcTarget?.exerciseName}
        setIndex={plateCalcTarget?.setIndex}
      />

      {/* Real-time 1RM Estimator & Training Zones Popover */}
      <OneRmEstimatorPopover
        open={oneRmTarget !== null}
        onClose={() => setOneRmTarget(null)}
        weight={oneRmTarget?.weight ?? 0}
        reps={oneRmTarget?.reps ?? 0}
        unit={unit}
        exerciseName={oneRmTarget?.exerciseName}
        setIndex={oneRmTarget?.setIndex}
      />
    </div>
  );
}
