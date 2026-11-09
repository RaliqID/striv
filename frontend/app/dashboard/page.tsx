"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { captureTokenFromUrl, readStoredUser, storeUser } from "@/lib/auth";
import type { DashboardStats } from "@/types/dashboard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";

/*
 * PR types arrive as machine enums ("one_rm"), which must not reach the UI
 * as-is. Same mapping as the records page — takes `t` because this is a
 * module-level helper, not a component.
 */
const PR_TYPE_KEYS: Record<string, string> = {
  weight: "records.typeWeight",
  one_rm: "records.typeOneRm",
  volume: "records.typeVolume",
  reps: "records.reps",
};

function prTypeLabel(type: string, t: (key: string) => string): string {
  const key = PR_TYPE_KEYS[type];
  return key ? t(key) : type;
}

function formatReviewRange(
  c: { week_start: string; week_end: string },
  locale: string,
): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };
  const start = fmt(c.week_start);
  const end = fmt(c.week_end);
  if (!start || !end) return "—";
  const year = new Date(c.week_end + "T00:00:00");
  return `${start} – ${end}, ${Number.isNaN(year.getTime()) ? "" : year.getFullYear()}`;
}

interface WeeklyReport {
  id: number;
  type: "weekly";
  week_start: string;
  content: {
    week_start: string;
    week_end: string;
    workouts: number;
    sets: number;
    volume_kg: number;
    prs: Array<{ exercise: string; type: string; value: number }>;
    pr_count: number;
    top_exercise: { name: string; volume: number } | null;
    summary: string;
    summary_source: "deterministic" | "ai_interpreted";
  };
  generated_at: string;
}

function formatDate(iso: string, t: (key: string, params?: Record<string, string | number>) => string, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t("dashboard.today");
  if (diff === 1) return t("dashboard.yesterday");
  if (diff < 7) return t("dashboard.daysAgo", { count: diff });
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/**
 * Time-of-day greeting.
 *
 * Takes `t` as an argument rather than calling the hook itself: this is a plain
 * module-level helper, not a component, so there is no hook context here.
 */
function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("dashboard.goodMorning");
  if (hour < 17) return t("dashboard.goodAfternoon");
  return t("dashboard.goodEvening");
}

export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const { label, formatVolume, formatWeight } = useUnit();
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string; profile?: { onboarding_completed_at?: string | null } | null } | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Latest weekly review
  const [latestReview, setLatestReview] = useState<WeeklyReport | null>(null);

  // Active goals state
  const [goals, setGoals] = useState<
    {
      id: number;
      exercise: { name: string } | null;
      target_type: string;
      target_value: number;
      starting_value: number;
      current_value: number;
      target_reps: number | null;
      unit: string;
      progress_percentage: number;
    }[]
  >([]);
  const [progressByGoal, setProgressByGoal] = useState<Record<number, number>>({});
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  // Load user from localStorage on mount; check onboarding guard
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Google OAuth landing: persist ?token= and hydrate user
      await captureTokenFromUrl();
      if (cancelled) return;

      const parsed = readStoredUser();
      if (parsed) {
        setUser(parsed);
        // Admins are exempt from the onboarding gate: their account exists to
        // administer the platform, and forcing them through the member
        // onboarding flow would block that for no reason.
        if (parsed?.is_admin) {
          return;
        }
        // Guard: incomplete onboarding → /onboarding
        const profile = parsed?.profile;
        if (profile && !profile.onboarding_completed_at) {
          router.replace("/onboarding");
        } else if (!profile) {
          // No profile yet — onboarding creates it. Verify via API before redirect.
          apiClient
            .get<{ profile?: { onboarding_completed_at?: string | null } | null }>("/profile")
            .then((res) => {
              if (cancelled) return;
              const p = res?.profile;
              if (!p || !p.onboarding_completed_at) {
                router.replace("/onboarding");
              } else {
                storeUser(res);
              }
            })
            .catch(() => {});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, reviewsRes] = await Promise.all([
        apiClient.get<DashboardStats>("/analytics/dashboard"),
        apiClient
          .get<{ data: WeeklyReport[] }>("/reviews/weekly?page=1")
          .catch(() => null), // best-effort
      ]);
      setStats(data);
      setLatestReview(reviewsRes?.data?.[0] ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        localStorage.removeItem("token");
        router.push("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
    /*
     * `t` is a dependency because the catch above builds the fallback message
     * from it. It is a useCallback keyed on locale, so it keeps a stable
     * identity until the language changes — at which point this callback must be
     * rebuilt, or a failed load would report itself in the language that was
     * active when the page first opened.
     */
  }, [router, t]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, reloadKey]);

  // Fetch active goals. Progress is embedded in the list response, so this is
  // a single request rather than one per goal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGoalsLoading(true);
      setGoalsError(null);
      try {
        const res = await apiClient.get<{
          data: {
            id: number;
            exercise: { name: string } | null;
            target_type: string;
            target_value: number;
            starting_value: number;
            current_value: number;
            target_reps: number | null;
            unit: string;
            progress_percentage: number;
          }[];
        }>("/goals?status=active");
        if (cancelled) return;

        const top = (res.data ?? []).slice(0, 3);
        setGoals(top);

        const next: Record<number, number> = {};
        for (const goal of top) {
          next[goal.id] = goal.progress_percentage ?? 0;
        }
        setProgressByGoal(next);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }
        setGoalsError(t("common.loadFailed"));
      } finally {
        if (!cancelled) setGoalsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, router]);

  const handleRetry = () => setReloadKey((k) => k + 1);

  // Compute strength display
  const strengthDisplay = stats?.strength_trend_pct != null
    ? `${stats.strength_trend_pct > 0 ? "+" : ""}${stats.strength_trend_pct.toFixed(1)}%`
    : "—";

  // Chart data
  const weeklyData = stats?.weekly_volume ?? [];
  const maxVolume = weeklyData.length ? Math.max(...weeklyData.map((w) => w.volume)) : 100;
  const chartPoints = weeklyData.map((w) => w.volume);
  // SVG path: map to viewBox 0 0 400 200
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = 20;
  const innerWidth = chartWidth - padding * 2;
  const innerHeight = chartHeight - padding * 2;
  const getPoint = (i: number, value: number) => {
    const x = padding + (i / (chartPoints.length - 1 || 1)) * innerWidth;
    const y = padding + innerHeight - (value / (maxVolume || 1)) * innerHeight;
    return { x, y };
  };
  let pathD = "";
  if (chartPoints.length > 0) {
    const first = getPoint(0, chartPoints[0]);
    pathD = `M${first.x},${first.y}`;
    for (let i = 1; i < chartPoints.length; i++) {
      const p = getPoint(i, chartPoints[i]);
      pathD += ` L${p.x},${p.y}`;
    }
  }

  return (
    <AppLayout user={user}>
      <div className="space-y-8">
        <section className="mb-12">
          <p className="font-body-md text-body-md text-on-surface-variant mb-2">
              {getGreeting(t)}. {stats?.strength_trend_pct != null && stats.strength_trend_pct > 0
              ? t("dashboard.trendUp")
              : stats?.strength_trend_pct != null && stats.strength_trend_pct < 0
              ? t("dashboard.trendSteady")
              : t("dashboard.trendKeep")}
          </p>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="font-metric-display text-[36px] leading-[40px] md:text-metric-display md:leading-[52px] text-primary">{strengthDisplay}</h2>
            <span className="font-headline-lg text-headline-lg text-on-surface-variant">{t("dashboard.strength")}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl p-6 bg-surface-container h-24" />
              ))
            ) : error ? (
              <div className="col-span-4 text-error font-body-md">{t("dashboard.errorStats")}</div>
            ) : (
              <>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">{t("dashboard.statWorkouts")}</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{stats?.workouts_last_30d ?? 0}</span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">{t("progress.sets")}</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{stats?.sets_last_30d ?? 0}</span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">{t("progress.volume")}</span>
                  <span className="font-headline-lg text-headline-lg text-primary">
                    {formatVolume(stats?.volume_last_30d ?? 0)}
                    {/* A real space, not a margin: a margin leaves textContent
                        as "236.8kkg", which is what a screen reader reads out. */}
                    {" "}
                    <span className="font-metric-sm text-metric-sm text-on-surface-variant">{label}</span>
                  </span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">{t("progress.strengthTrend")}</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{strengthDisplay}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 52-Week Activity Consistency Heatmap */}
        <ActivityHeatmap />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <section className="minimal-card rounded-xl p-6 lg:col-span-2 flex flex-col border border-border bg-surface-container-lowest">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-metric-sm text-metric-sm text-primary">{t("dashboard.strengthProgress")}</h3>
              <span className="font-label-caps text-label-caps text-on-surface-variant">{t("dashboard.last8Weeks")}</span>
            </div>
            {loading ? (
              <div className="animate-pulse h-48 bg-surface-container rounded" />
            ) : error ? (
              <div className="text-error font-body-md">{t("dashboard.errorProgress")}</div>
            ) : weeklyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-on-surface-variant font-body-md">{t("dashboard.noData")}</div>
            ) : (
              <div className="flex-1 relative min-h-[200px] md:min-h-[240px] w-full">
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
                  {/* Horizontal grid lines */}
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="50" y2="50" />
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="100" y2="100" />
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="150" y2="150" />
                  {pathD && (
                    <path className="stroke-primary fill-none" d={pathD} strokeWidth="2" />
                  )}
                  {chartPoints.length > 0 && (
                    <circle cx={getPoint(chartPoints.length - 1, chartPoints[chartPoints.length - 1]).x} cy={getPoint(chartPoints.length - 1, chartPoints[chartPoints.length - 1]).y} fill="#000" r="4" />
                  )}
                </svg>
              </div>
            )}
          </section>

          <section className="minimal-card rounded-xl p-4 md:p-6 bg-surface-container-low border-none relative overflow-hidden border border-border">
            <div className="absolute top-0 right-0 p-4">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
            </div>
            <h3 className="font-metric-sm text-metric-sm text-primary mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              {t("dashboard.intelligence")}
            </h3>
            {loading ? (
              <div className="animate-pulse h-20 bg-surface-container rounded" />
            ) : error ? (
              <p className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.insightUnavailable")}</p>
            ) : (
              <>
                <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-6">
                  {stats?.strength_trend_pct != null && stats.strength_trend_pct > 0
                    ? t("dashboard.strengthUp")
                    : stats?.strength_trend_pct != null && stats.strength_trend_pct < 0
                    ? t("dashboard.strengthBuilding")
                    : t("dashboard.push")}
                </p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-outline-variant pb-2">
                    <span className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.analyzedWindow")}</span>
                    <span className="font-metric-sm text-metric-sm text-primary">{t("dashboard.windowValue")}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-outline-variant pb-2">
                    <span className="font-body-md text-body-md text-on-surface-variant">{t("progress.sessions")}</span>
                    <span className="font-metric-sm text-metric-sm text-primary">{stats?.workouts_last_30d ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.strengthChange")}</span>
                    <span className="font-metric-sm text-metric-sm text-secondary">{strengthDisplay}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="minimal-card rounded-xl p-6 lg:col-span-2 border border-border bg-surface-container-lowest">
            <h3 className="font-metric-sm text-metric-sm text-primary mb-6">{t("dashboard.recentPrs")}</h3>
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-surface-container rounded-lg mb-4" />
              ))
            ) : error ? (
              <div className="text-error font-body-md">{t("dashboard.errorPrs")}</div>
            ) : stats?.recent_prs?.length === 0 ? (
              <div className="text-on-surface-variant font-body-md">{t("dashboard.noPrs")}</div>
            ) : (
              <div className="space-y-4">
                {stats?.recent_prs?.slice(0, 5).map((pr) => (
                  <div key={pr.id} className="flex justify-between items-center p-4 bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">fitness_center</span>
                      </div>
                      <div>
                        <h4 className="font-metric-sm text-metric-sm text-primary">{pr.exercise?.name ?? t("dashboard.exerciseFallback")}</h4>
                        <p className="font-body-md text-body-md text-on-surface-variant text-sm">{formatDate(pr.achieved_at, t, locale)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {/*
                        A PR is stored in kg, but only a weight/1RM record is a
                        mass — a volume record is kg lifted across the session,
                        which converts the same way. Rep-based records have no
                        unit at all, so they print the bare number.
                      */}
                      <span className="font-metric-sm text-metric-sm text-primary block">
                        {pr.pr_type === "reps"
                          ? pr.value
                          : `${formatWeight(pr.value)} ${label}`}
                      </span>
                      <span className="font-label-caps text-label-caps text-secondary uppercase">{prTypeLabel(pr.pr_type, t)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Latest Weekly Review */}
          {!loading && latestReview?.content && (
            <section className="minimal-card rounded-xl p-6 lg:col-span-2 border border-border bg-surface-container-lowest">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-metric-sm text-metric-sm text-primary">{t("dashboard.latestReview")}</h3>
                <a
                  href="/reviews/weekly"
                  className="font-metric-sm text-metric-sm text-secondary hover:underline"
                >
                  {t("workout.viewAll")}
                </a>
              </div>
              <p className="font-body-md text-body-md text-sm text-on-surface-variant mb-2">
                {formatReviewRange(latestReview.content, locale)}
              </p>
              <p className="font-body-md text-body-md text-on-surface line-clamp-3">
                {latestReview.content.summary}
              </p>
              {latestReview.content.summary_source === "ai_interpreted" && (
                <span className="inline-block mt-3 bg-secondary text-on-secondary rounded px-2 py-0.5 font-label-caps text-label-caps">
                  AI
                </span>
              )}
            </section>
          )}

          <section className="minimal-card rounded-xl p-6 border border-border bg-surface-container-lowest">
            <h3 className="font-metric-sm text-metric-sm text-primary mb-6">{t("dashboard.activeGoals")}</h3>
            {goalsLoading ? (
              <div className="space-y-6">
                <div className="animate-pulse h-10 bg-surface-container rounded" />
                <div className="animate-pulse h-10 bg-surface-container rounded" />
              </div>
            ) : goalsError || error ? (
              <div className="text-error font-body-md">
                {goalsError || t("common.loadFailed")}
                <button
                  onClick={handleRetry}
                  className="ml-3 text-primary font-semibold hover:underline"
                >
                  {t("action.retry")}
                </button>
              </div>
            ) : goals.length === 0 ? (
              <div>
                <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                  {t("dashboard.noActiveGoals")}
                </p>
                <a
                  href="/goals"
                  className="inline-block bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
                >
                  {t("dashboard.goToGoals")}
                </a>
              </div>
            ) : (
              <div className="space-y-6">
                {goals.map((g) => {
                  const pct = progressByGoal[g.id];
                  /*
                   * The server labels a goal's unit ("kg", "reps", or nothing
                   * for a workout count). Only a "kg" goal is a mass, so only
                   * that one converts — a rep target must not be run through the
                   * pound factor, which is why this branches rather than
                   * converting unconditionally.
                   */
                  const isWeight = g.unit === "kg";
                  const unit = g.unit ? ` ${isWeight ? label : g.unit}` : "";
                  const fmt = (raw: number) => (isWeight ? formatWeight(raw) : String(raw));

                  // Show the journey, not just a ratio: a bare percentage hides
                  // where the member started and what is actually left to do.
                  const targetLabel =
                    g.target_type === "weight" && g.target_reps
                      ? `${fmt(g.target_value)}${unit} × ${g.target_reps}`
                      : `${fmt(g.target_value)}${unit}`;

                  const displayPct = typeof pct === "number" ? `${Math.round(pct)}%` : "—";
                  const widthPct =
                    typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;

                  return (
                    <div key={g.id}>
                      <div className="flex justify-between items-end mb-2 gap-3">
                        <span className="min-w-0 truncate font-metric-sm text-metric-sm text-primary">
                          {g.exercise?.name ?? t("goals.allWorkouts")}
                          <span className="text-on-surface-variant">
                            {" · "}
                            {fmt(g.starting_value)}
                            {unit} → {targetLabel}
                          </span>
                        </span>
                        <span className="shrink-0 font-label-caps text-label-caps text-on-surface-variant">
                          {displayPct}
                        </span>
                      </div>
                      <div
                        className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={widthPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t("dashboard.ariaWorkoutsProgress", { name: g.exercise?.name ?? t("dashboard.statWorkouts") })}
                      >
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${widthPct}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}