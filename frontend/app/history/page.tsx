"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import type { WorkoutSession } from "@/types/history";
import type { Paginated } from "@/types/exercise";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const ENABLED_FILTER_KEYS = ["history.filterAll"];
const DISABLED_FILTER_KEYS = ["history.filterStrength", "history.filterHypertrophy"];

function formatDuration(total: number | null): string {
  if (total == null) return "—";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatStartedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function monthLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleString(locale, { month: "long", year: "numeric" })
    .toUpperCase();
}

interface SessionGroup {
  key: string;
  label: string;
  sessions: WorkoutSession[];
}

function groupByMonth(sessions: WorkoutSession[], locale: string): SessionGroup[] {
  const groups: SessionGroup[] = [];
  for (const session of sessions) {
    const key = monthKey(session.started_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.sessions.push(session);
    } else {
      groups.push({ key, label: monthLabel(session.started_at, locale), sessions: [session] });
    }
  }
  return groups;
}

export default function HistoryPage() {
  const { t, locale } = useTranslation();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("history.filterAll");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  // Local search filter (client-side across loaded sessions)
  const search = searchInput.trim().toLowerCase();
  const visible = search
    ? sessions.filter(
        (s) =>
          (s.notes ?? "").toLowerCase().includes(search) ||
          formatStartedAt(s.started_at, locale).toLowerCase().includes(search)
      )
    : sessions;

  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    const id = ++requestId.current;
    // Explicit branch rather than a ternary used for side effects, which reads
    // as a discarded expression and hides the intent.
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await apiClient.get<Paginated<WorkoutSession>>(
        `/workout-sessions?page=${targetPage}`
      );
      if (id !== requestId.current) return; // stale response
      const data = response?.data ?? [];
      setSessions((prev) => (append ? [...prev, ...data] : data));
      setPage(response.current_page ?? targetPage);
      setLastPage(response.last_page ?? targetPage);
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [t]);

  useEffect(() => {
    fetchPage(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const handleLoadMore = () => {
    if (loadingMore || page >= lastPage) return;
    fetchPage(page + 1, true);
  };

  const handleRetry = () => {
    setSessions([]);
    setPage(1);
    setLastPage(1);
    setReloadKey((k) => k + 1);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        {/* Header row */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
            {t("history.trainingHistory")}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("history.searchPlaceholder")}
                aria-label={t("history.searchPlaceholder")}
                className="w-full md:w-64 rounded-xl bg-surface-container-low border border-outline-variant pl-10 pr-4 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-1 focus:ring-outline transition"
              />
            </div>
            <button
              type="button"
              aria-label={t("history.filterList")}
              title={t("history.filterList")}
              className="rounded-xl bg-surface-container-low border border-outline-variant p-2 text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </header>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label={t("history.filterLabel")}>
          {ENABLED_FILTER_KEYS.map((key) => {
            const active = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilter(key)}
                className={
                  active
                    ? "rounded-xl bg-primary text-on-primary px-4 py-2 font-label-caps text-label-caps uppercase transition-colors"
                    : "rounded-xl bg-surface text-on-surface border border-outline-variant px-4 py-2 font-label-caps text-label-caps uppercase hover:bg-surface-container transition-colors"
                }
              >
                {t(key)}
              </button>
            );
          })}
          {DISABLED_FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled
              title={t("history.comingSoon")}
              aria-disabled="true"
              className="rounded-xl bg-surface text-on-surface border border-outline-variant px-4 py-2 font-label-caps text-label-caps uppercase opacity-50 cursor-not-allowed"
            >
              {t(key)}
            </button>
          ))}
          <button
            type="button"
            disabled
            title={t("history.comingSoon")}
            aria-disabled="true"
            className="ml-auto flex items-center gap-1 bg-surface border border-outline-variant rounded px-4 py-2 font-body-md text-body-md text-primary opacity-60 cursor-not-allowed"
          >
            {t("history.last30")}
            <span className="material-symbols-outlined text-[20px]">expand_more</span>
          </button>
        </div>

        {/* Content states */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse h-28 rounded-lg bg-surface-container" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <span className="material-symbols-outlined text-outline text-[32px]">cloud_off</span>
            <p className="font-body-md text-body-md text-on-surface">{t("history.couldntLoad")}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
            >
              {t("action.retry")}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <span className="material-symbols-outlined text-outline text-[48px]">history</span>
            <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary mt-2">
              {t("history.emptyTitle")}
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("history.emptyBody")}
            </p>
            <Link
              href="/workout/active"
              className="mt-4 rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
            >
              {t("workout.startWorkout")}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-6">
              {groupByMonth(visible, locale).map((group) => (
                <section key={group.key} className="flex flex-col gap-4">
                  <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {group.label}
                  </h2>
                  <div className="flex flex-col gap-4">
                    {group.sessions.map((session) => (
                      <Link
                        key={session.id}
                        href={`/workouts/${session.id}`}
                        className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 flex justify-between items-center flex-wrap gap-4 hover:border-primary hover:shadow-md transition-all duration-300 cursor-pointer"
                      >
                        {/* Left: icon + title + meta */}
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 flex-shrink-0 rounded bg-surface-container-low border border-outline-variant flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-surface-variant">
                              fitness_center
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-metric-sm text-body-md font-semibold text-primary truncate">
                              {session.notes?.trim() ? session.notes.trim() : t("workout.session")}
                            </h3>
                            <p className="flex items-center flex-wrap gap-1.5 font-label-caps text-label-caps text-on-surface-variant mt-1">
                              <span className="material-symbols-outlined text-[14px]">schedule</span>
                              <span>
                                {session.finished_at == null
                                  ? t("history.inProgress")
                                  : formatDuration(session.duration_minutes)}
                              </span>
                              <span aria-hidden="true">•</span>
                              <span>{formatStartedAt(session.started_at, locale)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Right: metrics + more */}
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
                              {t("nav.exercises")}
                            </p>
                            <p className="font-metric-sm text-metric-sm text-primary">
                              {session.workout_exercises_count ?? 0}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
                              {t("history.duration")}
                            </p>
                            <p className="font-metric-sm text-metric-sm text-primary">
                              {session.finished_at == null
                                ? "—"
                                : formatDuration(session.duration_minutes)}
                            </p>
                          </div>
                          <span
                            aria-hidden="true"
                            className="rounded-full p-1 text-on-surface-variant"
                          >
                            <span className="material-symbols-outlined">more_horiz</span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {page < lastPage && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="border border-outline rounded px-6 py-3 font-metric-sm text-metric-sm text-primary hover:bg-surface-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? t("history.loadingMore") : t("history.loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
