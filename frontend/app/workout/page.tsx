"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";
import type { WorkoutSession } from "@/types/history";
import type { Paginated } from "@/types/exercise";
import type { Routine } from "@/types/routine";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { setActiveWorkout } from "@/lib/active-workout";

/**
 * The server's answer to "what am I training today?".
 *
 * `status` drives the whole screen: ready shows the plan, in_progress resumes
 * the open session, rest_day and no_programme fall back to a free session.
 */
type TodayPlan = {
  status: "ready" | "in_progress" | "rest_day" | "no_programme";
  is_rest_day: boolean;
  day_of_week: number;
  schedule: {
    id: number;
    day_name: string;
    focus: string | null;
    confirmed: boolean;
  } | null;
  routine: {
    id: number;
    name: string;
    notes: string | null;
    auto_generated: boolean;
    est_duration_minutes: number | null;
    exercises: {
      id: number;
      exercise_id: number;
      name: string | null;
      order: number;
      target_sets: number | null;
      target_reps: number | null;
      target_weight_kg: number | null;
    }[];
  } | null;
  active_session: { id: number; started_at: string | null } | null;
  message: string;
};

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkoutLobbyPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [recent, setRecent] = useState<WorkoutSession[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  // Today's plan — fetched on load so the member opens straight onto the
  // session their trainer scheduled, rather than an empty form.
  const [today, setToday] = useState<TodayPlan | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [startingPlan, setStartingPlan] = useState(false);

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
      setRecentError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      if (id === requestId.current) setRecentLoading(false);
      await routinesPromise;
    }
  }, [t]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent, reloadKey]);

  // Load today's plan. Failure is non-fatal: the member falls back to the
  // free-session option rather than being blocked from training.
  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<TodayPlan>("/workout/today")
      .then((res) => {
        if (!cancelled) setToday(res);
      })
      .catch(() => {
        if (!cancelled) setToday(null);
      })
      .finally(() => {
        if (!cancelled) setTodayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Start the prescribed session.
   *
   * Reuses the routine-start endpoint, which already creates the session with
   * every exercise and its target set rows pre-created — so the member only
   * fills in kg and reps as they go.
   */
  const handleStartFromPlan = async (routineId: number) => {
    setStartingPlan(true);
    setStartError(null);
    try {
      const res = await apiClient.post<{ id: number }>(`/routines/${routineId}/start`, {});
      sessionStorage.setItem("activeSessionId", String(res.id));
      setActiveWorkout({
        sessionId: res.id,
        name: today?.routine?.name || t("workout.session"),
        startedAt: new Date().toISOString(),
        completedSetsCount: 0,
        totalSetsCount: 0,
        exerciseCount: 0,
        lastUpdated: Date.now(),
      });
      router.push("/workout/active");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setStartError(err instanceof ApiError ? err.message : t("common.actionFailed"));
      setStartingPlan(false);
    }
  };

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
          setActiveWorkout({
            sessionId: session.id,
            name: t("workout.session"),
            startedAt: session.started_at || new Date().toISOString(),
            completedSetsCount: 0,
            totalSetsCount: 0,
            exerciseCount: 0,
            lastUpdated: Date.now(),
          });
        } catch {}
      }
      router.push("/workout/active");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setStartError(
        err instanceof ApiError ? err.message : t("common.actionFailed")
      );
      setStarting(false);
    }
  };

  const handleUseRoutine = async (routineId: number) => {
    if (usingRoutineId != null) return;
    setUsingRoutineId(routineId);
    setStartError(null);
    const routine = routines.find((r) => r.id === routineId);
    try {
      const session = await apiClient.post<{ id: number }>(
        `/routines/${routineId}/start`,
        {}
      );
      if (session?.id) {
        try {
          sessionStorage.setItem("activeSessionId", String(session.id));
          setActiveWorkout({
            sessionId: session.id,
            name: routine?.name || t("workout.session"),
            startedAt: new Date().toISOString(),
            completedSetsCount: 0,
            totalSetsCount: 0,
            exerciseCount: 0,
            lastUpdated: Date.now(),
          });
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
        err instanceof ApiError ? err.message : t("common.actionFailed")
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
            {t("workout.lobby")}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={t("workout.filterList")}
              className="rounded-xl bg-surface-variant border border-outline-variant p-2 text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
            <button
              type="button"
              aria-label={t("workout.moreOptions")}
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
              {starting ? t("action.sending") : t("workout.startWorkout")}
            </button>
          </div>
        </header>

        {/*
          Today's plan, loaded from the server.
          
          This replaces the old "start an empty workout and build it yourself"
          hero. The member never picks their own session: the weekly schedule
          says which day trains what, and the trainer's prescribed programme
          says which movements. All that is left for the member is to log the
          numbers, which is the point.
        */}
        {todayLoading ? (
          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-8">
            <div className="flex items-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span className="font-body-md text-body-md">{t("workout.loadingPlan")}</span>
            </div>
          </section>
        ) : today?.status === "in_progress" && today.active_session ? (
          /* A session is already open — send them back into it, not into a new one. */
          <section className="rounded-xl border border-primary bg-primary/5 p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-2 self-start rounded bg-surface-variant px-2 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {t("workout.inProgress")}
                  </span>
                </span>
                <h2 className="font-headline-lg text-headline-lg text-primary">
                  {t("workout.resumeTitle")}
                </h2>
                <p className="max-w-xl font-body-md text-body-md text-on-surface-variant">
                  {t("workout.resumeBody")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/workout/active")}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-8 py-4 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary-hover"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                {t("workout.resume")}
              </button>
            </div>
          </section>
        ) : today?.status === "ready" && today.routine ? (
          /* The happy path: today has a plan, show it and start it. */
          <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
            <div className="flex flex-col gap-6 p-8 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded bg-surface-variant px-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
                    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                      {t("workout.todaysPlan")} · {t(`day.${today.day_of_week}`)}
                    </span>
                  </span>
                  {today.routine.auto_generated && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-label-caps text-label-caps text-primary">
                      {t("workout.fromTrainer")}
                    </span>
                  )}
                </div>

                <h2 className="font-headline-lg text-headline-lg text-primary">
                  {today.routine.name}
                </h2>

                {today.schedule?.focus && (
                  <p className="font-metric-sm text-metric-sm text-on-surface">
                    {today.schedule.focus}
                  </p>
                )}

                <ul className="mt-1 flex flex-col gap-1">
                  {today.routine.exercises.map((ex) => (
                    <li
                      key={ex.id}
                      className="flex items-center justify-between gap-4 border-b border-outline-variant py-2 last:border-0"
                    >
                      <span className="font-body-md text-body-md text-on-surface">
                        {ex.order}. {ex.name}
                      </span>
                      <span className="whitespace-nowrap font-body-md text-sm text-on-surface-variant">
                        {ex.target_sets ?? "—"} × {ex.target_reps ?? "—"}
                        {ex.target_weight_kg !== null && ` @ ${ex.target_weight_kg} kg`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3 md:items-end">
                {today.routine.est_duration_minutes && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    ~{today.routine.est_duration_minutes} {t("trainer.minPerSession")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleStartFromPlan(today.routine!.id)}
                  disabled={startingPlan}
                  className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-8 py-4 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">play_arrow</span>
                  {startingPlan ? t("action.sending") : t("workout.startThisPlan")}
                </button>
              </div>
            </div>
            {startError && (
              <p className="px-8 pb-4 text-error font-body-md text-sm" role="alert">
                {startError}
              </p>
            )}
          </section>
        ) : (
          /* Rest day, or no trainer/programme yet. Starting a free session stays
             available, but is presented as the fallback rather than the default. */
          <section className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
            <div className="flex flex-col items-center gap-8 p-8 md:flex-row">
              <div className="flex flex-1 flex-col gap-3 text-center md:text-left">
                <span className="inline-flex items-center gap-2 self-center rounded bg-surface-variant px-2 py-1 md:self-start">
                  <span className="h-1.5 w-1.5 rounded-full bg-outline" aria-hidden="true" />
                  <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {today?.is_rest_day ? t("workout.restDay") : t("workout.noPlan")}
                  </span>
                </span>
                <h2 className="font-headline-lg text-headline-lg text-primary">
                  {today?.is_rest_day ? t("workout.noSessionToday") : t("workout.noPlanTitle")}
                </h2>
                <p className="max-w-xl font-body-md text-body-md text-on-surface-variant">
                  {today?.is_rest_day ? t("workout.noSessionTodayBody") : t("workout.noPlanBody")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartWorkout}
                disabled={starting}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant px-8 py-4 font-metric-sm text-metric-sm text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                {starting ? t("action.sending") : t("workout.startEmpty")}
              </button>
            </div>
            {startError && (
              <p className="px-8 pb-4 text-error font-body-md text-sm" role="alert">
                {startError}
              </p>
            )}
          </section>
        )}

        {/* My Routines (horizontal scroll) */}
        {routines.length > 0 && (
          <section>
            <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant">
                  list_alt
                </span>
                <h2 className="font-label-caps text-[14px] tracking-widest text-on-surface-variant uppercase">
                  {t("workout.myRoutines")}
                </h2>
              </div>
              <Link
                href="/routines"
                className="font-metric-sm text-metric-sm text-primary hover:underline transition-colors"
              >
                {t("workout.manage")}
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
                      {count} {t("workout.exercises")} · ~
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
                      {usingRoutineId === r.id ? t("action.sending") : t("action.continue")}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* {t("workout.recentSessions")} */}
        <section>
          <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">
                list_alt
              </span>
              <h2 className="font-label-caps text-[14px] tracking-widest text-on-surface-variant uppercase">
                {t("workout.recentSessions")}
              </h2>
            </div>
            <Link
              href="/history"
              className="font-metric-sm text-metric-sm text-primary hover:underline transition-colors"
            >
              {t("workout.viewAll")}
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
                {t("common.loadFailed")}
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
              >
                {t("action.retry")}
              </button>
            </div>
          ) : recent.length === 0 ? (
            <div className="border-dashed border-outline-variant rounded-xl p-8 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-outline text-4xl">
                history
              </span>
              <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                {t("workout.noSessions")}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("workout.noSessionsBody")}
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
                    {session.notes?.trim() ? session.notes.trim() : t("workout.session")}
                  </h3>
                  <p className="font-body-md text-sm text-on-surface-variant flex items-center flex-wrap gap-1.5">
                    <span>{session.workout_exercises_count ?? 0} {t("workout.exercises")}</span>
                    <span aria-hidden="true">•</span>
                    <span>{formatDate(session.started_at, locale)}</span>
                    <span aria-hidden="true">•</span>
                    <span>{session.finished_at == null ? t("goals.statusActive") : t("workout.completed")}</span>
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
