"use client";

import { apiClient, ApiError } from "@/lib/api";
import type { Exercise } from "@/types/exercise";
import type { Paginated } from "@/types/exercise";
import type {
  WorkoutExercise,
  WorkoutSet,
  UiExercise,
  UiSet,
  FinishResponse,
  SessionSummary,
} from "./types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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

export default function ActiveWorkoutPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [exercises, setExercises] = useState<UiExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
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
  const [restActive, setRestActive] = useState(false);
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const sessionStartedAtRef = useRef<string | null>(null);
  const startedLoadingRef = useRef(false);

  const menusOpenFor = useRef<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

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
          name: we.exercise?.name ?? "Exercise",
          sets: (we.sets ?? []).map((s) => ({
            id: s.id,
            setNumber: s.set_number,
            kg: toInput(s.weight_kg),
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
        window.location.href = "/workout";
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId == null) return;
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
  }, [sessionId, loadExercises, reloadKey]);

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

  // Rest timer
  const startRest = (seconds: number) => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestSeconds(seconds);
    setRestActive(true);
    restIntervalRef.current = setInterval(() => {
      setRestSeconds((prev) => {
        if (prev === null || prev <= 0) {
          if (restIntervalRef.current) clearInterval(restIntervalRef.current);
          setRestActive(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const closeRest = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestActive(false);
    setRestSeconds(null);
  };

  useEffect(() => {
    return () => {
      if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    };
  }, []);

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
      setPickerError("Couldn't load exercises.");
    } finally {
      setPickerLoading(false);
    }
  }, [pickerDebounced]);

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
      setPickerError(err instanceof ApiError ? err.message : "Couldn't add exercise.");
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
      setError(err instanceof ApiError ? err.message : "Couldn't remove exercise.");
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
      setError(err instanceof ApiError ? err.message : "Couldn't add set.");
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
      setError(err instanceof ApiError ? err.message : "Couldn't delete set.");
    }
  };

  // Update set fields (debounced PUT 500ms, only when changed)
  const updateSetTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const lastSavedValues = useRef<Map<string, { kg: string; reps: string }>>(
    new Map()
  );

  const persistSet = useCallback(
    async (workoutExerciseId: number, setId: number, kg: string, reps: string) => {
      if (sessionId == null) return;
      try {
        const updated = await apiClient.put<WorkoutSet>(
          `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`,
          { weight_kg: parseNum(kg), reps: parseNum(reps) }
        );
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === workoutExerciseId
              ? {
                  ...ex,
                  sets: ex.sets.map((s) =>
                    s.id === setId
                      ? { ...s, saved: true, kg: toInput(updated?.weight_kg), reps: toInput(updated?.reps) }
                      : s
                  ),
                }
              : ex
          )
        );
        const key = `${workoutExerciseId}:${setId}`;
        lastSavedValues.current.set(key, { kg: toInput(updated?.weight_kg), reps: toInput(updated?.reps) });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(err instanceof ApiError ? err.message : "Couldn't save set.");
      }
    },
    [sessionId]
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
        persistSet(workoutExerciseId, setId, set.kg, set.reps);
      }, 500)
    );
  };

  // Ref mirror for debounce closures
  const exercisesRef = useRef<UiExercise[]>([]);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const toggleSet = (workoutExerciseId: number, setId: number) => {
    const key = `${workoutExerciseId}:${setId}`;
    setCompletedSets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        startRest(90);
      }
      return next;
    });
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
      setSummary(
        response?.summary ?? {
          exercises: exercises.length,
          sets: exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
          volume_kg: 0,
        }
      );
      setSummaryDate(response?.session?.finished_at ?? new Date().toISOString());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setFinishError(
        err instanceof ApiError ? err.message : "Couldn't finish workout."
      );
    } finally {
      setFinishing(false);
    }
  };

  // Screens

  if (summary) {
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface flex items-center justify-center px-margin-mobile md:px-margin-desktop py-12">
        <div className="flex flex-col items-center gap-8 w-full max-w-2xl text-center">
          <div className="w-20 h-20 rounded-full bg-secondary-fixed flex items-center justify-center">
            <span className="material-symbols-outlined text-on-secondary-fixed text-[40px]">
              emoji_events
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Workout Complete.
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            <div className="border border-outline-variant rounded-xl bg-surface p-6 flex flex-col gap-2 items-center">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Exercises
              </span>
              <span className="font-metric-display text-metric-display text-primary">
                {summary.exercises}
              </span>
            </div>
            <div className="border border-outline-variant rounded-xl bg-surface p-6 flex flex-col gap-2 items-center">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Sets
              </span>
              <span className="font-metric-display text-metric-display text-primary">
                {summary.sets}
              </span>
            </div>
            <div className="border border-outline-variant rounded-xl bg-surface p-6 flex flex-col gap-2 items-center">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Volume
              </span>
              <span className="font-metric-display text-metric-display text-primary">
                {Math.round(summary.volume_kg)}
                <span className="font-metric-sm text-metric-sm text-on-surface-variant ml-1">
                  kg
                </span>
              </span>
            </div>
          </div>
          {summaryDate && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {new Date(summaryDate).toLocaleString(undefined, {
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
            Back to Dashboard
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
            No active session.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Start a workout from the Lobby first.
          </p>
          <Link
            href="/workout"
            className="mt-4 rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
          >
            Go to Lobby
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
          aria-label="Minimize workout"
          className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined text-[24px]">expand_more</span>
        </Link>
        <div className="flex flex-col items-center min-w-0">
          <h1 className="font-metric-sm text-metric-sm">Workout</h1>
          <div className="flex items-center gap-1 text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span className="font-label-caps text-label-caps tracking-widest tabular-nums">
              {formatTime(globalSeconds)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleFinish}
          disabled={finishing}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-metric-sm text-metric-sm hover:bg-on-surface-variant transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {finishing ? "Finishing..." : "Finish"}
        </button>
      </header>

      {finishError && (
        <div
          className="mx-margin-mobile md:mx-margin-desktop mt-4 max-w-[800px] w-full flex items-center justify-between gap-4 bg-error-container text-on-error-container rounded-lg px-4 py-3"
          role="alert"
        >
          <span className="font-body-md text-sm">{finishError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
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
                Retry
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
                          {setCount} {setCount === 1 ? "set" : "sets"}
                        </p>
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={`Options for ${exercise.name}`}
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
                                Delete set {idx + 1}
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
                              Remove exercise
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-surface-container-low/50 border-b border-outline-variant">
                      <div className="col-span-2 text-center font-label-caps text-label-caps text-on-surface-variant">SET</div>
                      <div className="col-span-4 text-center font-label-caps text-label-caps text-on-surface-variant">KG</div>
                      <div className="col-span-4 text-center font-label-caps text-label-caps text-on-surface-variant">REPS</div>
                      <div className="col-span-2 text-center font-label-caps text-label-caps text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      {exercise.sets.map((set, setIdx) => {
                        const completed = completedSets.has(`${exercise.id}:${set.id}`);
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
                                aria-label={`Set ${setIdx + 1} weight in kg`}
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
                                aria-label={`Set ${setIdx + 1} reps`}
                                onChange={(e) =>
                                  updateSetField(exercise.id, set.id, "reps", e.target.value)
                                }
                                readOnly={completed}
                              />
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <button
                                type="button"
                                aria-label={`Mark set ${setIdx + 1} complete`}
                                className={`set-toggle w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  completed
                                    ? "border-primary bg-primary text-on-primary"
                                    : "border-outline-variant text-transparent hover:border-primary bg-surface"
                                }`}
                                onClick={() => toggleSet(exercise.id, set.id)}
                              >
                                <span className="material-symbols-outlined">check</span>
                              </button>
                            </div>
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
                      Add Set
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
                <span className="font-metric-sm text-metric-sm">Add Exercise</span>
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
          aria-label="Add exercise"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-surface rounded-xl border border-outline-variant p-6 w-full max-w-md max-h-[70vh] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                Add Exercise
              </h2>
              <button
                type="button"
                aria-label="Close"
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
                placeholder="Search exercises..."
                aria-label="Search exercises"
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
                  No exercises found.
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
      {restActive && restSeconds !== null && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-outline-variant rounded-full px-2 py-2 flex items-center gap-4 shadow-lg z-50"
          style={{ transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease" }}
        >
          <div className="w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
          </div>
          <div className="flex flex-col pr-4 min-w-[80px]">
            <span className="font-label-caps text-label-caps text-on-surface-variant">RESTING</span>
            <span className="font-headline-lg-mobile text-headline-lg-mobile tabular-nums tracking-tighter leading-none">
              {formatTime(restSeconds)}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close rest timer"
            className="w-10 h-10 rounded-full hover:bg-surface-variant flex items-center justify-center transition-colors text-on-surface-variant"
            onClick={closeRest}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
