"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { captureTokenFromUrl, readStoredUser, storeUser } from "@/lib/auth";
import type { DashboardStats, RecentPR, WeeklyVolume } from "@/types/dashboard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function formatVolume(vol: number): string {
  if (vol >= 1000) {
    return (vol / 1000).toFixed(1) + "k";
  }
  return vol.toString();
}

function formatReviewRange(c: { week_start: string; week_end: string }): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
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
      exercise: { name: string };
      target_type: string;
      target_value: number;
      target_reps: number | null;
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
      setError(err instanceof ApiError ? err.message : "Couldn't load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, reloadKey]);

  // Fetch active goals + progress for first 3
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGoalsLoading(true);
      setGoalsError(null);
      try {
        const res = await apiClient.get<{
          data: {
            id: number;
            exercise: { name: string };
            target_type: string;
            target_value: number;
            target_reps: number | null;
          }[];
        }>("/goals?status=active");
        if (cancelled) return;
        const active = res.data ?? [];
        const top = active.slice(0, 3);
        setGoals(top);
        if (top.length > 0) {
          const results = await Promise.all(
            top.map((g) =>
              apiClient
                .get<{ goal: unknown; current_value: number; progress_percentage: number }>(
                  `/goals/${g.id}/progress`
                )
                .catch(() => null)
            )
          );
          if (cancelled) return;
          const next: Record<number, number> = {};
          top.forEach((g, i) => {
            const r = results[i];
            if (r && typeof r.progress_percentage === "number") {
              next[g.id] = r.progress_percentage;
            }
          });
          setProgressByGoal(next);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }
        setGoalsError("Couldn't load goals.");
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
            {getGreeting()}. {stats?.strength_trend_pct != null && stats.strength_trend_pct > 0
              ? "Your training is trending upward."
              : stats?.strength_trend_pct != null && stats.strength_trend_pct < 0
              ? "Stay consistent, you're building."
              : "Keep showing up."}
          </p>
          <div className="flex items-baseline gap-4 mb-8">
            <h2 className="font-metric-display text-metric-display text-primary">{strengthDisplay}</h2>
            <span className="font-headline-lg text-headline-lg text-on-surface-variant">Strength</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl p-6 bg-surface-container h-24" />
              ))
            ) : error ? (
              <div className="col-span-4 text-error font-body-md">Error loading stats.</div>
            ) : (
              <>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">Workouts</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{stats?.workouts_last_30d ?? 0}</span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">Sets</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{stats?.sets_last_30d ?? 0}</span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">Volume</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{formatVolume(stats?.volume_last_30d ?? 0)}</span>
                </div>
                <div className="minimal-card rounded-xl p-6 flex flex-col justify-between border border-border bg-surface-container-lowest">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-2">Strength Trend</span>
                  <span className="font-headline-lg text-headline-lg text-primary">{strengthDisplay}</span>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <section className="minimal-card rounded-xl p-6 lg:col-span-2 flex flex-col border border-border bg-surface-container-lowest">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-metric-sm text-metric-sm text-primary">Strength Progress</h3>
              <span className="font-label-caps text-label-caps text-on-surface-variant">LAST 8 WEEKS</span>
            </div>
            {loading ? (
              <div className="animate-pulse h-48 bg-surface-container rounded" />
            ) : error ? (
              <div className="text-error font-body-md">Couldn&apos;t load progress.</div>
            ) : weeklyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-on-surface-variant font-body-md">{"No data yet."}</div>
            ) : (
              <div className="flex-1 relative min-h-[240px] w-full">
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
                  {/* Horizontal grid lines */}
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="50" y2="50" />
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="100" y2="100" />
                  <line stroke="#f1edec" strokeWidth="1" x1="0" x2="400" y1="150" y2="150" />
                  {pathD && (
                    <path className="stroke-primary fill-none" d={pathD} strokeWidth="2" />
                  )}
                  {chartPoints.length > 0 && (
                    <>
                      {/* Current point (last) */}
                      <circle cx={getPoint(chartPoints.length - 1, chartPoints[chartPoints.length - 1]).x} cy={getPoint(chartPoints.length - 1, chartPoints[chartPoints.length - 1]).y} fill="#000" r="4" />
                      {/* Projected (dashed line to future) - not implemented */}
                    </>
                  )}
                </svg>
              </div>
            )}
          </section>

          <section className="minimal-card rounded-xl p-6 bg-surface-container-low border-none relative overflow-hidden border border-border">
            <div className="absolute top-0 right-0 p-4">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
            </div>
            <h3 className="font-metric-sm text-metric-sm text-primary mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              Striv Intelligence
            </h3>
            {loading ? (
              <div className="animate-pulse h-20 bg-surface-container rounded" />
            ) : error ? (
              <p className="font-body-md text-body-md text-on-surface-variant">Insight unavailable.</p>
            ) : (
              <>
                <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-6">
                  {stats?.strength_trend_pct != null && stats.strength_trend_pct > 0
                    ? "Your strength is trending upward."
                    : stats?.strength_trend_pct != null && stats.strength_trend_pct < 0
                    ? "Strength is building. Stay consistent."
                    : "Keep pushing."}
                </p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-outline-variant pb-2">
                    <span className="font-body-md text-body-md text-on-surface-variant">Analyzed Window</span>
                    <span className="font-metric-sm text-metric-sm text-primary">8 Weeks</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-outline-variant pb-2">
                    <span className="font-body-md text-body-md text-on-surface-variant">Sessions</span>
                    <span className="font-metric-sm text-metric-sm text-primary">{stats?.workouts_last_30d ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-body-md text-body-md text-on-surface-variant">Strength Change</span>
                    <span className="font-metric-sm text-metric-sm text-secondary">{strengthDisplay}</span>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="minimal-card rounded-xl p-6 lg:col-span-2 border border-border bg-surface-container-lowest">
            <h3 className="font-metric-sm text-metric-sm text-primary mb-6">Recent Personal Records</h3>
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-surface-container rounded-lg mb-4" />
              ))
            ) : error ? (
              <div className="text-error font-body-md">Couldn&apos;t load PRs.</div>
            ) : stats?.recent_prs?.length === 0 ? (
              <div className="text-on-surface-variant font-body-md">{"No PRs yet. Keep training."}</div>
            ) : (
              <div className="space-y-4">
                {stats?.recent_prs?.slice(0, 5).map((pr) => (
                  <div key={pr.id} className="flex justify-between items-center p-4 bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">fitness_center</span>
                      </div>
                      <div>
                        <h4 className="font-metric-sm text-metric-sm text-primary">{pr.exercise?.name ?? "Exercise"}</h4>
                        <p className="font-body-md text-body-md text-on-surface-variant text-sm">{formatDate(pr.achieved_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-metric-sm text-metric-sm text-primary block">{pr.value} {pr.pr_type === 'weight' ? 'kg' : ''}</span>
                      <span className="font-label-caps text-label-caps text-secondary uppercase">{pr.pr_type}</span>
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
                <h3 className="font-metric-sm text-metric-sm text-primary">Latest Weekly Review</h3>
                <a
                  href="/reviews/weekly"
                  className="font-metric-sm text-metric-sm text-secondary hover:underline"
                >
                  View all
                </a>
              </div>
              <p className="font-body-md text-body-md text-sm text-on-surface-variant mb-2">
                {formatReviewRange(latestReview.content)}
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
            <h3 className="font-metric-sm text-metric-sm text-primary mb-6">Active Goals</h3>
            {goalsLoading ? (
              <div className="space-y-6">
                <div className="animate-pulse h-10 bg-surface-container rounded" />
                <div className="animate-pulse h-10 bg-surface-container rounded" />
              </div>
            ) : goalsError || error ? (
              <div className="text-error font-body-md">
                {goalsError || "Couldn't load goals."}
                <button
                  onClick={handleRetry}
                  className="ml-3 text-primary font-semibold hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : goals.length === 0 ? (
              <div>
                <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                  No active goals. Set one in Goals.
                </p>
                <a
                  href="/goals"
                  className="inline-block bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
                >
                  Go to Goals
                </a>
              </div>
            ) : (
              <div className="space-y-6">
                {goals.map((g) => {
                  const pct = progressByGoal[g.id];
                  const targetLabel =
                    g.target_type === "weight"
                      ? `${g.target_value} kg${g.target_reps ? ` × ${g.target_reps} reps` : ""}`
                      : g.target_type === "reps"
                      ? `${g.target_value} reps`
                      : g.target_type === "one_rm"
                      ? `${g.target_value} kg 1RM`
                      : `${g.target_value} workouts`;
                  const displayPct = typeof pct === "number" ? `${pct}%` : "—";
                  const widthPct =
                    typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between items-end mb-2">
                        <span className="font-metric-sm text-metric-sm text-primary">
                          {g.exercise.name} {targetLabel}
                        </span>
                        <span className="font-label-caps text-label-caps text-on-surface-variant">
                          {displayPct}
                        </span>
                      </div>
                      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
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