"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SessionSet {
  id: number;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

interface SessionExercise {
  id: number;
  order: number | null;
  notes: string | null;
  exercise: {
    id: number;
    name: string;
    slug: string;
    category: string | null;
    equipment: string | null;
  } | null;
  sets: SessionSet[] | null;
}

interface SessionDetail {
  id: number;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  workout_exercises: SessionExercise[] | null;
}

function formatStartedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(total: number | null): string {
  if (total == null) return "—";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatVolume(vol: number): string {
  if (vol >= 1000) {
    return (vol / 1000).toFixed(1) + "k";
  }
  return Math.round(vol).toString();
}

function formatWeight(kg: number | null): string {
  if (kg == null) return "—";
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

export default function SessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await apiClient.get<SessionDetail>(
          `/workout-sessions/${params.id}`
        );
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) {
            window.location.href = "/login";
            return;
          }
          if (err.status === 404) {
            setNotFound(true);
            setLoading(false);
            return;
          }
          setError(err.message);
        } else {
          setError("Couldn't load workout.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, reloadKey]);

  const handleRetry = () => setReloadKey((k) => k + 1);

  if (notFound) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center text-center gap-4 py-20">
          <span className="material-symbols-outlined text-outline text-4xl">error</span>
          <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
            Workout not found.
          </p>
          <Link
            href="/history"
            className="bg-primary text-on-primary rounded px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
          >
            Back to History
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="h-6 w-32 rounded bg-surface-container animate-pulse" />
          <div className="h-40 rounded-xl bg-surface-container animate-pulse" />
          <div className="h-56 rounded-xl bg-surface-container animate-pulse" />
          <div className="h-56 rounded-xl bg-surface-container animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center text-center gap-4 py-20">
          <p className="font-body-md text-body-md text-error">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="bg-primary text-on-primary rounded px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return null;
  }

  const exercises = data.workout_exercises ?? [];
  const totalSets = exercises.reduce(
    (acc, we) => acc + (we.sets?.length ?? 0),
    0
  );
  const totalVolume = exercises.reduce((acc, we) => {
    if (!we.sets) return acc;
    return (
      acc +
      we.sets.reduce((s, set) => {
        if (set.weight_kg == null || set.reps == null) return s;
        return s + set.weight_kg * set.reps;
      }, 0)
    );
  }, 0);

  const inProgress = data.finished_at == null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back row */}
        <Link
          href="/history"
          className="inline-flex items-center gap-2 font-metric-sm text-metric-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          Back
        </Link>

        {/* Header card */}
        <div className="border border-outline-variant rounded-xl bg-surface-container-lowest p-6">
          <h1 className="font-headline-lg text-headline-lg text-primary">
            {data.notes?.trim() ? data.notes.trim() : "Workout Session"}
          </h1>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 font-body-md text-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              {formatStartedAt(data.started_at)}
            </span>
            <span aria-hidden="true">•</span>
            {inProgress ? (
              <span className="bg-secondary/10 text-secondary rounded px-2 py-0.5 font-label-caps text-label-caps">
                In progress
              </span>
            ) : (
              <span>{formatDuration(data.duration_minutes)}</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Exercises
              </p>
              <p className="font-headline-lg text-headline-lg text-primary mt-1">
                {exercises.length}
              </p>
            </div>
            <div>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Sets
              </p>
              <p className="font-headline-lg text-headline-lg text-primary mt-1">
                {totalSets}
              </p>
            </div>
            <div>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                Volume
              </p>
              <p className="font-headline-lg text-headline-lg text-primary mt-1">
                {formatVolume(totalVolume)}
              </p>
            </div>
          </div>
        </div>

        {/* Empty session state */}
        {exercises.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 text-center">
            <p className="font-body-md text-body-md text-on-surface-variant">
              No exercises were logged in this session.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exercises.map((we) => {
              const sets = we.sets ?? [];
              return (
                <section
                  key={we.id}
                  className="border border-outline-variant rounded-xl bg-surface-container-lowest overflow-hidden"
                >
                  <header className="bg-surface px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                    <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                      {we.exercise?.name ?? "Exercise"}
                    </h2>
                    <p className="font-body-md text-body-md text-sm text-on-surface-variant">
                      {sets.length} {sets.length === 1 ? "set" : "sets"}
                    </p>
                  </header>

                  {sets.length === 0 ? (
                    <p className="font-body-md text-body-md text-sm text-on-surface-variant py-4 px-6">
                      No sets logged.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-surface-container-low/50 border-b border-outline-variant">
                        <div className="col-span-2 text-center font-label-caps text-label-caps text-on-surface-variant">
                          SET
                        </div>
                        <div className="col-span-5 text-center font-label-caps text-label-caps text-on-surface-variant">
                          KG
                        </div>
                        <div className="col-span-5 text-center font-label-caps text-label-caps text-on-surface-variant">
                          REPS
                        </div>
                      </div>
                      <div className="flex flex-col">
                        {sets.map((set, idx) => (
                          <div
                            key={set.id}
                            className="grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-outline-variant/50 last:border-b-0"
                          >
                            <div className="col-span-2 flex justify-center">
                              <span className="font-metric-sm text-metric-sm bg-surface-variant w-8 h-8 rounded-full flex items-center justify-center">
                                {idx + 1}
                              </span>
                            </div>
                            <div className="col-span-5 text-center font-metric-sm text-metric-sm text-on-surface">
                              {formatWeight(set.weight_kg)}
                            </div>
                            <div className="col-span-5 text-center font-metric-sm text-metric-sm text-on-surface">
                              {set.reps ?? "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
