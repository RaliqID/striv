"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * One exercise, with the member's own history for it.
 *
 * ---------------------------------------------------------------------------
 * THIS PAGE USED TO SHOW INVENTED NUMBERS
 * ---------------------------------------------------------------------------
 * Every figure on it was hardcoded — "45 kg" as the current best, "60 kg" as the
 * estimated 1RM, "1,240 kg" as volume — and the page never called the API at all.
 * A member opening an exercise they had never performed was shown three confident
 * statistics presented as their own record.
 *
 * That is worse than an empty page. An empty state tells the truth; fabricated
 * numbers tell a lie that a member might act on, and it destroys trust in every
 * other number in the app once they notice.
 *
 * It now fetches `GET /analytics/exercises/{slug}` and renders what that returns.
 * The shape, verified against the live API:
 *
 *   { exercise: {...}, summary: { sessions, total_volume,
 *                                 best: {weight, reps, e1rm, date},
 *                                 latest_e1rm, latest_e1rm_date },
 *     points: [{ session_id, date, e1rm, weight, reps }] }
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A REAL EMPTY STATE
 * ---------------------------------------------------------------------------
 * A member with no sets logged for an exercise gets an explanation, not zeros.
 * "0 kg" reads as a measurement that happens to be zero; "you have not logged
 * this yet" is the actual situation and tells them what to do about it.
 */
type Exercise = {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  movement_pattern: string | null;
  equipment: string | null;
  muscle_groups?: { id: number; name: string }[];
};

type Summary = {
  sessions: number;
  total_volume: number;
  best: { weight: number; reps: number; e1rm: number; date: string } | null;
  latest_e1rm: number | null;
  latest_e1rm_date: string | null;
};

type Analytics = {
  exercise: Exercise;
  summary: Summary;
  points: { session_id: number; date: string; e1rm: number; weight: number; reps: number }[];
};

export default function ExerciseDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) ?? "";

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await apiClient.get<Analytics>(`/analytics/exercises/${slug}`);

        // Narrow rather than trust: a malformed body must not blank the page.
        if (!cancelled) {
          setData({
            exercise: res?.exercise ?? ({} as Exercise),
            summary: res?.summary ?? ({} as Summary),
            points: Array.isArray(res?.points) ? res.points : [],
          });
        }
      } catch (err: any) {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");

          return;
        }

        setError(err?.status === 404 ? t("exercises.notFound") : t("common.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, router, t]);

  const exercise = data?.exercise;
  const summary = data?.summary;
  const hasHistory = (summary?.sessions ?? 0) > 0 && summary?.best != null;

  /** Locale-aware date, so "7 Oct 2026" follows the member's language. */
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);

    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-on-surface-variant">
              <a href="/exercises" aria-label={t("exercises.backToList")}>
                <span className="material-symbols-outlined cursor-pointer text-sm transition-colors hover:text-primary">
                  arrow_back
                </span>
              </a>
              <span className="font-label-caps text-label-caps uppercase tracking-widest">
                {exercise?.muscle_groups?.length
                  ? exercise.muscle_groups.map((m) => m.name).join(" / ")
                  : t("exercises.breadcrumb")}
              </span>
            </div>
            <h1 className="font-headline-lg-mobile tracking-tight text-on-surface md:font-headline-lg md:text-headline-lg">
              {exercise?.name ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
            </h1>
          </div>
          <div className="flex gap-3">
            <a
              href="/workout"
              className="flex items-center gap-2 rounded border border-outline-variant px-4 py-2 transition-colors hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-[20px]">play_arrow</span>
              <span className="font-metric-sm text-metric-sm">{t("workout.startWorkout")}</span>
            </a>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl border border-outline-variant bg-surface"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <span className="material-symbols-outlined text-5xl text-outline" aria-hidden="true">
              error
            </span>
            <p className="font-body-md text-body-md text-on-surface-variant">{error}</p>
            <a
              href="/exercises"
              className="rounded-full bg-primary px-6 py-2 font-metric-sm text-metric-sm text-on-primary"
            >
              {t("exercises.title")}
            </a>
          </div>
        ) : !hasHistory ? (
          /*
           * The honest empty state.
           *
           * This is the case the fabricated numbers used to cover up: a member
           * who has never performed this movement. Showing "0 kg" would read as
           * a measurement; saying so plainly tells them what to do instead.
           */
          <div className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface px-6 py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-outline" aria-hidden="true">
              fitness_center
            </span>
            <p className="font-metric-sm text-metric-sm text-on-surface">
              {t("exercises.noHistoryTitle")}
            </p>
            <p className="max-w-md font-body-md text-body-md text-on-surface-variant">
              {t("exercises.noHistoryBody")}
            </p>
            <a
              href="/workout"
              className="mt-2 rounded-full bg-primary px-6 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90"
            >
              {t("workout.startWorkout")}
            </a>
          </div>
        ) : (
          <>
            <section className="mb-8 grid grid-cols-1 gap-gutter md:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface p-6 transition-shadow duration-300 hover:shadow-sm">
                <div className="mb-8 flex items-center justify-between">
                  <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                    {t("exercises.currentBest")}
                  </h3>
                  <span className="material-symbols-outlined text-outline" aria-hidden="true">
                    emoji_events
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-metric-display text-metric-display text-on-surface">
                      {summary!.best!.weight}
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                      {t("exercises.unitKg")}
                    </span>
                  </div>
                  <p className="mt-1 font-metric-sm text-metric-sm text-outline">
                    {t("exercises.bestSetDetail", {
                      reps: summary!.best!.reps,
                      date: formatDate(summary!.best!.date),
                    })}
                  </p>
                </div>
              </div>

              <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-outline-variant bg-surface p-6 transition-shadow duration-300 hover:shadow-sm">
                <div className="mb-8 flex items-center justify-between">
                  <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                    {t("exercises.estimated1rm")}
                  </h3>
                  <span className="material-symbols-outlined text-[18px] text-secondary" aria-hidden="true">
                    psychology
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-metric-display text-metric-display text-on-surface">
                      {summary!.latest_e1rm ?? summary!.best!.e1rm}
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                      {t("exercises.unitKg")}
                    </span>
                  </div>
                  <p className="mt-1 font-metric-sm text-metric-sm text-outline">
                    {formatDate(summary!.latest_e1rm_date)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface p-6 transition-shadow duration-300 hover:shadow-sm">
                <div className="mb-8 flex items-center justify-between">
                  <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                    {t("dashboard.totalVolume")}
                  </h3>
                  <span className="material-symbols-outlined text-outline" aria-hidden="true">
                    stacked_bar_chart
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-metric-display text-metric-display text-on-surface">
                      {Math.round(summary!.total_volume).toLocaleString(locale)}
                    </span>
                    <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                      {t("exercises.unitKg")}
                    </span>
                  </div>
                  <p className="mt-1 font-metric-sm text-metric-sm text-outline">
                    {t("exercises.sessionCount", { count: summary!.sessions })}
                  </p>
                </div>
              </div>
            </section>

            {/*
              Equipment and movement pattern come from the exercise record itself,
              which the API returns alongside the analytics.
            */}
            <section className="rounded-xl border border-outline-variant bg-surface p-6">
              <h2 className="mb-4 font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                {t("exercises.about")}
              </h2>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div>
                  <dt className="font-label-caps text-label-caps text-outline">{t("exercises.equipment")}</dt>
                  <dd className="font-body-md text-body-md text-on-surface">{exercise?.equipment ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-label-caps text-label-caps text-outline">{t("exercises.muscleGroup")}</dt>
                  <dd className="font-body-md text-body-md text-on-surface">
                    {exercise?.muscle_groups?.map((m) => m.name).join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-label-caps text-label-caps text-outline">{t("exercises.movementPattern")}</dt>
                  <dd className="font-body-md text-body-md text-on-surface">{exercise?.movement_pattern ?? "—"}</dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
