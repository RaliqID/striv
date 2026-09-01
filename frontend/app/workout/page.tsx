"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import type { WorkoutSession } from "@/types/history";
import type { Paginated } from "@/types/exercise";
import type { Routine } from "@/types/routine";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkoutLobbyPage() {
  const router = useRouter();
  const [recent, setRecent] = useState<WorkoutSession[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  // Routines (first 6)
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [usingRoutineId, setUsingRoutineId] = useState<number | null>(null);

  // Load first page of sessions, keep first 3; load routines in parallel
  const fetchRecent = useCallback(async () => {
    const id = ++requestId.current;
    setRecentLoading(true);
    setRecentError(null);
    const routinesPromise = apiClient
      .get<Paginated<Routine>>("/routines?page=1")
      .then((res) => {
        if (id === requestId.current) setRoutines((res?.data ?? []).slice(0, 6));
      })
      .catch(() => {}); // best-effort — hide section on failure
    try {
      const response = await apiClient.get<Paginated<WorkoutSession>>(
        "/workout-sessions?page=1"
      );
      if (id !== requestId.current) return; // stale response
      setRecent((response?.data ?? []).slice(0, 3));
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setRecentError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      if (id === requestId.current) setRecentLoading(false);
      await routinesPromise;
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent, reloadKey]);

  const handleStartWorkout = async () => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const session = await apiClient.post<WorkoutSession>(
        "/workout-sessions",
        { started_at: new Date().toISOString() }
      );
      if (session?.id) {
        try {
          sessionStorage.setItem("activeSessionId", String(session.id));
        } catch {}
      }
      router.push("/workout/active");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setStartError(
        err instanceof ApiError ? err.message : "Couldn't start the workout."
      );
      setStarting(false);
    }
  };

  const handleUseRoutine = async (routineId: number) => {
    if (usingRoutineId != null) return;
    setUsingRoutineId(routineId);
    setStartError(null);
    try {
      const session = await apiClient.post<{ id: number }>(
        `/routines/${routineId}/start`,
        {}
      );
      if (session?.id) {
        try {
          sessionStorage.setItem("activeSessionId", String(session.id));
        } catch {}
        window.location.href = "/workout/active";
        return;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setStartError(
        err instanceof ApiError ? err.message : "Couldn't start this routine."
      );
    }
    setUsingRoutineId(null);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-10">
        {/* Header row */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Lobby
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label="Filter list"
              className="rounded-xl bg-surface-variant border border-outline-variant p-2 text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
            <button
              type="button"
              aria-label="More options"
              className="rounded-xl bg-surface-variant border border-outline-variant p-2 text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
            <button
              type="button"
              onClick={handleStartWorkout}
              disabled={starting}
              className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-4 py-2 hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {starting ? "Starting..." : "Start Workout"}
            </button>
          </div>
        </header>

        {/* Quick Start Hero */}
        <section className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
          <div className="p-8 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 text-center md:text-left flex flex-col gap-3">
              <span className="inline-flex items-center gap-2 bg-surface-variant rounded px-2 py-1 self-center md:self-start">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Ready to train
                </span>
              </span>
              <h2 className="font-headline-lg text-headline-lg text-primary">
                Start your session.
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-xl">
                Log an empty workout and build your routine on the fly. Focus on
                the execution, we&apos;ll track the rest.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartWorkout}
              disabled={starting}
              className="flex items-center gap-2 bg-primary text-on-primary rounded-lg px-8 py-4 font-metric-sm text-metric-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <span className="material-symbols-outlined">play_arrow</span>
              {starting ? "Starting..." : "Start Empty Workout"}
            </button>
          </div>
          {startError && (
            <p className="px-8 pb-4 text-error font-body-md text-sm" role="alert">
              {startError}
            </p>
          )}
        </section>

        {/* My Routines (horizontal scroll) */}
        {routines.length > 0 && (
          <section>
            <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant">
                  list_alt
                </span>
                <h2 className="font-label-caps text-[14px] tracking-widest text-on-surface-variant uppercase">
                  My Routines
                </h2>
              </div>
              <Link
                href="/routines"
                className="font-metric-sm text-metric-sm text-primary hover:underline transition-colors"
              >
                Manage
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2">
              {routines.map((r) => {
                const exNames = (r.routine_exercises ?? [])
                  .map((re) => re.exercise?.name)
                  .filter(Boolean) as string[];
                const count = r.routine_exercises_count ?? exNames.length;
                return (
                  <div
                    key={r.id}
                    className="flex-shrink-0 w-64 border border-outline-variant rounded-lg bg-surface-container-lowest p-4 flex flex-col"
                  >
                    <h3 className="font-metric-sm text-metric-sm text-primary truncate">
                      {r.name}
                    </h3>
                    <p className="font-body-md text-sm text-on-surface-variant mt-1">
                      {count} {count === 1 ? "exercise" : "exercises"} · ~
                      {r.est_duration_minutes != null ? r.est_duration_minutes : "—"} min
                    </p>
                    <div className="flex-1 mt-2">
                      {exNames.slice(0, 2).map((n) => (
                        <p key={n} className="font-body-md text-sm text-on-surface truncate">
                          {n}
                        </p>
                      ))}
                      {exNames.length > 2 && (
                        <p className="font-body-md text-sm text-on-surface-variant">
                          +{exNames.length - 2} more
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUseRoutine(r.id)}
                      disabled={usingRoutineId != null}
                      className="mt-3 bg-primary text-on-primary rounded-lg px-3 py-1.5 font-metric-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {usingRoutineId === r.id ? "Starting..." : "Use"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Sessions */}
        <section>
          <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">
                list_alt
              </span>
              <h2 className="font-label-caps text-[14px] tracking-widest text-on-surface-variant uppercase">
                Recent Sessions
              </h2>
            </div>
            <Link
              href="/history"
              className="font-metric-sm text-metric-sm text-primary hover:underline transition-colors"
            >
              View All
            </Link>
          </div>

          {recentLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse h-24 rounded-lg bg-surface-container" />
              ))}
            </div>
          ) : recentError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <p className="font-body-md text-body-md text-on-surface">
                Couldn&apos;t load recent sessions.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
              >
                Retry
              </button>
            </div>
          ) : recent.length === 0 ? (
            <div className="border-dashed border-outline-variant rounded-xl p-8 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-outline text-4xl">
                history
              </span>
              <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                No sessions yet.
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Start your first workout to build your routine history.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recent.map((session) => (
                <div
                  key={session.id}
                  className="border border-outline-variant rounded-lg bg-surface-container-lowest p-5 flex flex-col gap-2 hover:border-outline hover:shadow-md transition-all duration-300"
                >
                  <h3 className="font-metric-sm text-metric-sm text-primary truncate">
                    {session.notes?.trim() ? session.notes.trim() : "Workout Session"}
                  </h3>
                  <p className="font-body-md text-sm text-on-surface-variant flex items-center flex-wrap gap-1.5">
                    <span>{session.workout_exercises_count ?? 0} exercises</span>
                    <span aria-hidden="true">•</span>
                    <span>{formatDate(session.started_at)}</span>
                    <span aria-hidden="true">•</span>
                    <span>{session.finished_at == null ? "In progress" : "Completed"}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
