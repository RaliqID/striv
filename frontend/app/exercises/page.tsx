"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import type { Exercise, Paginated } from "@/types/exercise";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const MUSCLE_FILTERS: { label: string; value: string }[] = [
  { label: "ALL MUSCLES", value: "" },
  { label: "CHEST", value: "chest" },
  { label: "BACK", value: "back" },
  { label: "LEGS", value: "legs" },
  { label: "SHOULDERS", value: "shoulders" },
  { label: "CORE", value: "core" },
];

const SPARKLINE_HEIGHTS = [8, 12, 16, 20, 24, 32];

function tagText(exercise: Exercise): string {
  const primary = exercise.muscle_groups?.find((mg) => mg.pivot?.is_primary);
  const muscle = primary?.name ?? exercise.muscle_groups?.[0]?.name;
  const parts = [muscle, exercise.equipment].filter(Boolean);
  return parts.join(" • ").toUpperCase();
}

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  // Debounce search 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      const id = ++requestId.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (muscle) params.set("muscle", muscle);
        params.set("page", String(targetPage));
        const response = await apiClient.get<Paginated<Exercise>>(
          `/exercises?${params.toString()}`
        );
        if (id !== requestId.current) return; // stale response
        const data = response?.data ?? [];
        setExercises((prev) => (append ? [...prev, ...data] : data));
        setPage(response.current_page ?? targetPage);
        setLastPage(response.last_page ?? targetPage);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof ApiError ? err.message : "Something went wrong."
        );
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search, muscle]
  );

  // Refetch on filter/search change
  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage, reloadKey]);

  const handleLoadMore = () => {
    if (loadingMore || page >= lastPage) return;
    fetchPage(page + 1, true);
  };

  const handleRetry = () => {
    setExercises([]);
    setPage(1);
    setLastPage(1);
    setReloadKey((k) => k + 1);
  };

  const selectMuscle = (value: string) => {
    if (value !== muscle) setMuscle(value);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        {/* Header row */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            Exercise Library
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 md:flex-none min-w-[220px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search exercises..."
                aria-label="Search exercises"
                className="w-full md:w-64 rounded-xl bg-surface-variant border border-outline-variant pl-10 pr-4 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-1 focus:ring-outline transition"
              />
            </div>
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
            <Link
              href="/workout/active"
              className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-4 py-2 hover:bg-primary-hover transition-colors whitespace-nowrap"
            >
              Start Workout
            </Link>
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-3" role="group" aria-label="Filter by muscle">
          {MUSCLE_FILTERS.map((filter) => {
            const active = muscle === filter.value;
            return (
              <button
                key={filter.label}
                type="button"
                aria-pressed={active}
                onClick={() => selectMuscle(filter.value)}
                className={
                  active
                    ? "rounded-xl bg-primary text-on-primary px-5 py-3 font-label-caps text-label-caps uppercase transition-colors"
                    : "rounded-xl bg-surface-container text-on-surface border border-outline-variant px-5 py-3 font-label-caps text-label-caps uppercase hover:bg-surface-container-high transition-colors"
                }
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {/* Content states */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse h-48 rounded-xl bg-surface-container"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <span className="material-symbols-outlined text-outline text-[32px]">
              cloud_off
            </span>
            <p className="font-body-md text-body-md text-on-surface">
              Couldn&apos;t load exercises.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
            >
              Retry
            </button>
          </div>
        ) : exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <span className="material-symbols-outlined text-outline text-[32px]">
              search_off
            </span>
            <p className="font-body-md text-body-md text-on-surface">
              No exercises found.
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Try a different search or filter.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exercises.map((exercise) => (
                <Link
                  key={exercise.id}
                  href={`/exercises/${exercise.slug}`}
                  className="border border-outline-variant rounded-xl p-5 bg-white/70 flex flex-col gap-4 hover:border-outline hover:shadow-md transition-all duration-300"
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 flex-shrink-0 rounded bg-surface-variant border border-outline-variant flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-surface-variant">
                        fitness_center
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-metric-sm text-metric-sm text-primary truncate">
                        {exercise.name}
                      </h2>
                      <span className="inline-block mt-1 bg-surface-container px-2 py-0.5 text-[10px] uppercase tracking-wider text-on-surface-variant rounded">
                        {tagText(exercise)}
                      </span>
                    </div>
                    <span
                      className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors"
                      role="button"
                      tabIndex={0}
                      aria-label={`More options for ${exercise.name}`}
                      onClick={(e) => e.preventDefault()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                        }
                      }}
                    >
                      more_horiz
                    </span>
                  </div>

                  {/* Divider row */}
                  <div className="border-t border-outline-variant pt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-on-surface-variant font-label-caps">
                        Est. 1RM
                      </p>
                      <p className="font-metric-sm text-metric-sm text-on-surface mt-1">
                        —
                      </p>
                    </div>
                    {/* Decorative sparkline placeholder */}
                    <div
                      className="flex items-end gap-1"
                      aria-hidden="true"
                    >
                      {SPARKLINE_HEIGHTS.map((height, i) => (
                        <span
                          key={i}
                          className={
                            i === SPARKLINE_HEIGHTS.length - 1
                              ? "w-1.5 rounded-sm bg-secondary"
                              : "w-1.5 rounded-sm bg-surface-dim"
                          }
                          style={{ height: `${height}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {page < lastPage && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="border border-outline rounded p-3 px-6 font-metric-sm text-metric-sm text-primary hover:bg-surface-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Loading..." : "Load More Exercises"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
