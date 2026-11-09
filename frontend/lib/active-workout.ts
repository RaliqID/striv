"use client";

import { useEffect, useState, useCallback } from "react";

export interface ActiveWorkoutState {
  sessionId: number;
  name: string;
  startedAt: string;
  completedSetsCount: number;
  totalSetsCount: number;
  exerciseCount: number;
  lastUpdated: number;
}

const STORAGE_KEY = "striv_active_workout";
const SESSION_STORAGE_KEY = "activeSessionId";
export const ACTIVE_WORKOUT_EVENT = "striv_active_workout_changed";

/**
 * Read the current active workout from client storage.
 * Combines localStorage state with sessionStorage fallback.
 */
export function getActiveWorkout(): ActiveWorkoutState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveWorkoutState;
      if (parsed && typeof parsed.sessionId === "number" && !Number.isNaN(parsed.sessionId)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted JSON in localStorage
  }

  // Fallback to activeSessionId from sessionStorage if available
  try {
    const fallbackIdStr = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const fallbackId = fallbackIdStr ? Number(fallbackIdStr) : null;
    if (fallbackId && Number.isFinite(fallbackId)) {
      const syntheticState: ActiveWorkoutState = {
        sessionId: fallbackId,
        name: "Workout Session",
        startedAt: new Date().toISOString(),
        completedSetsCount: 0,
        totalSetsCount: 0,
        exerciseCount: 0,
        lastUpdated: Date.now(),
      };
      // Persist synthetic state so other listeners receive it
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(syntheticState));
      } catch {}
      return syntheticState;
    }
  } catch {}

  return null;
}

/**
 * Persist active workout state and broadcast update to all tabs/components.
 */
export function setActiveWorkout(state: ActiveWorkoutState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    sessionStorage.setItem(SESSION_STORAGE_KEY, String(state.sessionId));
  } catch {}

  window.dispatchEvent(
    new CustomEvent(ACTIVE_WORKOUT_EVENT, { detail: state })
  );
}

/**
 * Merge partial updates into current active workout state.
 */
export function updateActiveWorkout(partial: Partial<ActiveWorkoutState>): void {
  const current = getActiveWorkout();
  if (!current) return;

  const updated: ActiveWorkoutState = {
    ...current,
    ...partial,
    lastUpdated: Date.now(),
  };

  setActiveWorkout(updated);
}

/**
 * Clear active workout state upon session finish or discard.
 */
export function clearActiveWorkout(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}

  window.dispatchEvent(
    new CustomEvent(ACTIVE_WORKOUT_EVENT, { detail: null })
  );
}

/**
 * Reactive hook to observe active workout state across route transitions.
 */
export function useActiveWorkout(): {
  activeWorkout: ActiveWorkoutState | null;
  clearWorkout: () => void;
  updateWorkout: (partial: Partial<ActiveWorkoutState>) => void;
} {
  const [activeWorkout, setActiveWorkoutState] = useState<ActiveWorkoutState | null>(null);

  useEffect(() => {
    setActiveWorkoutState(getActiveWorkout());

    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<ActiveWorkoutState | null>).detail;
      setActiveWorkoutState(detail ?? null);
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === SESSION_STORAGE_KEY) {
        setActiveWorkoutState(getActiveWorkout());
      }
    };

    window.addEventListener(ACTIVE_WORKOUT_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  const clearWorkout = useCallback(() => {
    clearActiveWorkout();
  }, []);

  const updateWorkout = useCallback((partial: Partial<ActiveWorkoutState>) => {
    updateActiveWorkout(partial);
  }, []);

  return {
    activeWorkout,
    clearWorkout,
    updateWorkout,
  };
}
