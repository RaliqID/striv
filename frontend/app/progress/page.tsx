"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type E1rmPoint = {
  session_id: number;
  date: string;
  e1rm: number;
  weight: number;
  reps: number;
};

type E1rmSeries = {
  slug: string;
  name: string;
  points: E1rmPoint[];
};

type WeeklyVolume = {
  week_start: string;
  volume: number;
};

type WeeklyFrequency = {
  week_start: string;
  workouts: number;
};

type Consistency = {
  target_days: number | null;
  avg_sessions_per_week: number | null;
  adherence_pct: number | null;
} | null;

type ProgressData = {
  volume_by_day: { date: string; volume: number }[];
  volume_by_week: WeeklyVolume[];
  frequency_weekly: WeeklyFrequency[];
  e1rm_trend: E1rmSeries[];
  consistency: Consistency;
};

const PERIODS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatVolume(vol: number): string {
  if (vol >= 1000) return (vol / 1000).toFixed(1) + "k";
  return vol.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ProgressPage() {
  const router = useRouter();
  const [periodDays, setPeriodDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProgressData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<ProgressData>(
        `/analytics/progress?days=${periodDays}`
      );
      setData(response);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't load progress data.");
    } finally {
      setLoading(false);
    }
  }, [periodDays, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData, reloadKey]);

  const handleRetry = () => setReloadKey((k) => k + 1);

  // ---- E1RM chart ----
  const e1rmSeries = data?.e1rm_trend?.find((s) => s.points.length >= 2) ?? null;
  const e1rmPoints = e1rmSeries?.points ?? [];
  const latestE1rm = e1rmPoints.length > 0 ? e1rmPoints[e1rmPoints.length - 1].e1rm : null;
  const firstE1rm = e1rmPoints.length > 0 ? e1rmPoints[0].e1rm : null;
  const delta = firstE1rm && latestE1rm ? ((latestE1rm - firstE1rm) / firstE1rm) * 100 : null;
  const e1rmName = e1rmSeries?.name ?? "No exercise";

  // Build SVG path and projection
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, bottom: 30, left: 20, right: 20 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const getPoint = (index: number, value: number, total: number) => {
    const x = padding.left + (index / Math.max(total - 1, 1)) * innerWidth;
    const yMax = Math.max(...e1rmPoints.map((p) => p.e1rm), 1);
    const y = padding.top + innerHeight - (value / yMax) * innerHeight;
    return { x, y };
  };

  let pathD = "";
  let projectedPathD = "";
  if (e1rmPoints.length >= 2) {
    const pts = e1rmPoints.map((p) => p.e1rm);
    const maxVal = Math.max(...pts, 1);
    const points = pts.map((v, i) => getPoint(i, v, pts.length));
    pathD = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");

    // Projection: last two points
    const last = pts.length - 1;
    const p1 = getPoint(last - 1, pts[last - 1], pts.length);
    const p2 = getPoint(last, pts[last], pts.length);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // Extend by 15% of width
    const extendX = innerWidth * 0.15;
    const slope = dy / dx;
    const p3x = p2.x + extendX;
    const p3y = p2.y + slope * extendX;
    projectedPathD = `M${p2.x},${p2.y} L${p3x},${p3y}`;
  }

  // ---- Weekly Frequency ----
  const frequencyData = data?.frequency_weekly ?? [];
  const avgSessions = frequencyData.length > 0
    ? frequencyData.reduce((sum, w) => sum + w.workouts, 0) / frequencyData.length
    : null;
  const adherence = data?.consistency?.adherence_pct ?? null;
  const targetDays = data?.consistency?.target_days ?? null;
  const avgSessionsVal = data?.consistency?.avg_sessions_per_week ?? avgSessions;
  const diff = (avgSessionsVal !== null && targetDays !== null)
    ? avgSessionsVal - targetDays
    : null;

  // Radial progress: circumference = 2 * pi * 48 = 301.59
  const circumference = 2 * Math.PI * 48;
  const offset = adherence !== null ? circumference * (1 - adherence / 100) : circumference;

  // ---- Weekly Volume Bars ----
  const weeklyVolumes = data?.volume_by_week ?? [];
  const last8 = weeklyVolumes.slice(-8);
  const maxVol = last8.length > 0 ? Math.max(...last8.map(w => w.volume)) : 1;
  const totalLast4 = weeklyVolumes.slice(-4).reduce((sum, w) => sum + w.volume, 0);

  // ---- Consistency Map ----
  const frequencyMap = data?.frequency_weekly ?? [];
  // Build 12 columns x 7 rows, pad leading with zeros
  const numWeeks = 12;
  const daysPerWeek = 7;
  const totalCells = numWeeks * daysPerWeek;
  // Assume frequency entries are in order, one per week. Use workouts count per week.
  // We'll map each week's workouts to 7 cells, but we need to map each day? Simpler: we have weekly data, so each week gets a column, and we repeat that column 7 times.
  // Or we could use volume_by_day if available for daily granularity. But spec says use frequency_weekly.
  // We'll treat each week as a column, and each day in that week has the same intensity.
  // So we need 12 columns, each with 7 rows. For columns beyond data length, pad with zeros.
  const weekCounts = frequencyMap.map(w => w.workouts);
  const paddedCounts = Array.from({ length: numWeeks }, (_, i) => i < weekCounts.length ? weekCounts[i] : 0);
  // Build grid: for each column (week), we have 7 rows all with same value (since we only have weekly data)
  // Actually we need 84 cells. We'll fill column by column (week), each column gets 7 cells of same value.
  const gridCells = paddedCounts.flatMap(count => Array(daysPerWeek).fill(count));

  // Determine color scale: 0 -> bg-surface-container-highest, 1 -> bg-outline-variant, 2 -> bg-outline, 3+ -> bg-primary
  const getColor = (val: number) => {
    if (val === 0) return "bg-surface-container-highest";
    if (val === 1) return "bg-outline-variant";
    if (val === 2) return "bg-outline";
    return "bg-primary";
  };

  const totalWorkouts = frequencyMap.reduce((sum, w) => sum + w.workouts, 0);

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-4">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight">Progress</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-lg">
              Comprehensive analysis of your training trajectory across volume, strength, and consistency.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-surface-container-low rounded-lg p-1 border border-outline-variant">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriodDays(p.days)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded font-metric-sm text-metric-sm transition-colors ${
                  periodDays === p.days
                    ? "bg-surface border border-outline-variant shadow-sm text-primary"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <p className="font-body-md text-body-md text-on-surface">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 hover:bg-primary-hover transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!error && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
            {/* Estimated 1RM Avg */}
            <div className="md:col-span-8 bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col group hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300 relative overflow-hidden">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-metric-sm text-metric-sm text-on-surface-variant uppercase tracking-wider">Estimated 1RM Avg</h3>
                    {e1rmPoints.length >= 2 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" title="AI Predicted Data Available"></span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    {loading ? (
                      <div className="animate-pulse h-12 w-24 bg-surface-container rounded"></div>
                    ) : (
                      <>
                        <span className="font-metric-display text-metric-display text-primary">
                          {latestE1rm !== null ? Math.round(latestE1rm) : "—"}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">kg</span>
                        {delta !== null && delta !== 0 && (
                          <span className={`font-metric-sm text-metric-sm ${delta > 0 ? "text-secondary-container" : "text-error"} bg-secondary-container/10 px-2 py-0.5 rounded ml-2`}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <button className="text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>
              <div className="h-64 w-full relative mt-auto">
                {loading ? (
                  <div className="animate-pulse h-full w-full bg-surface-container rounded" />
                ) : e1rmPoints.length < 2 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-on-surface-variant font-body-md border border-dashed border-outline-variant rounded">
                    <span className="material-symbols-outlined text-4xl mb-2">insights</span>
                    <p>No strength data yet</p>
                    <p className="text-sm">Start logging workouts to see your trend.</p>
                  </div>
                ) : (
                  <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                    <defs>
                      <linearGradient id="aiGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#6063ee" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#6063ee" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line stroke="#e5e2e1" strokeWidth="1" strokeDasharray="4 4" x1="0" x2="600" y1="50" y2="50" />
                    <line stroke="#e5e2e1" strokeWidth="1" strokeDasharray="4 4" x1="0" x2="600" y1="100" y2="100" />
                    <line stroke="#e5e2e1" strokeWidth="1" strokeDasharray="4 4" x1="0" x2="600" y1="150" y2="150" />
                    {pathD && (
                      <path className="stroke-primary fill-none" d={pathD} strokeWidth="1.5" />
                    )}
                    {projectedPathD && (
                      <path className="stroke-secondary fill-none" d={projectedPathD} strokeDasharray="4 4" strokeWidth="1.5" />
                    )}
                    {/* Data points */}
                    {e1rmPoints.map((p, i) => {
                      const pt = getPoint(i, p.e1rm, e1rmPoints.length);
                      return (
                        <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#000" />
                      );
                    })}
                    {/* Last point highlighted */}
                    {e1rmPoints.length > 0 && (
                      <circle
                        cx={getPoint(e1rmPoints.length - 1, e1rmPoints[e1rmPoints.length - 1].e1rm, e1rmPoints.length).x}
                        cy={getPoint(e1rmPoints.length - 1, e1rmPoints[e1rmPoints.length - 1].e1rm, e1rmPoints.length).y}
                        r={4}
                        fill="#000"
                        stroke="#fff"
                        strokeWidth="2"
                      />
                    )}
                    {/* X-axis labels */}
                    <text x="0" y={chartHeight - 5} className="text-[10px] text-outline font-label-caps">
                      {e1rmPoints.length > 0 ? formatDate(e1rmPoints[0].date) : ""}
                    </text>
                    <text x={chartWidth - 40} y={chartHeight - 5} className="text-[10px] text-outline font-label-caps text-right">
                      {e1rmPoints.length > 0 ? formatDate(e1rmPoints[e1rmPoints.length - 1].date) : ""}
                    </text>
                    {e1rmPoints.length >= 2 && (
                      <text x={chartWidth - 20} y={30} className="text-[10px] text-secondary-container font-label-caps text-right">
                        Projected
                      </text>
                    )}
                  </svg>
                )}
              </div>
            </div>

            {/* Weekly Frequency */}
            <div className="md:col-span-4 bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col group hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-metric-sm text-metric-sm text-on-surface-variant uppercase tracking-wider mb-1">Weekly Frequency</h3>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <div className="animate-pulse h-8 w-16 bg-surface-container rounded"></div>
                    ) : (
                      <>
                        <span className="font-headline-lg text-headline-lg text-primary">
                          {avgSessions !== null ? avgSessions.toFixed(1) : "—"}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">days/wk</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center relative min-h-[200px]">
                {loading ? (
                  <div className="animate-pulse w-40 h-40 rounded-full bg-surface-container"></div>
                ) : (
                  <div className="w-40 h-40 rounded-full border-4 border-surface-container-high relative flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        fill="none"
                        r="48"
                        stroke="#000000"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeWidth="4"
                      />
                    </svg>
                    <div className="text-center">
                      <span className="block font-metric-display text-[32px] font-semibold text-primary">
                        {adherence !== null ? Math.round(adherence) : "—"}
                      </span>
                      <span className="block font-label-caps text-[10px] text-on-surface-variant mt-1">Adherence</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-between items-center text-sm">
                <span className="text-on-surface-variant">
                  Target: {targetDays !== null ? `${targetDays} days` : "Set in profile"}
                </span>
                {diff !== null && diff !== 0 && (
                  <span className={`font-metric-sm ${diff < 0 ? "text-error bg-error-container/30" : "text-secondary-container bg-secondary-container/10"} px-2 py-0.5 rounded`}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Weekly Volume */}
            <div className="md:col-span-6 bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col group hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="font-metric-sm text-metric-sm text-on-surface-variant uppercase tracking-wider mb-1">Weekly Volume</h3>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <div className="animate-pulse h-8 w-20 bg-surface-container rounded"></div>
                    ) : (
                      <>
                        <span className="font-headline-lg text-headline-lg text-primary">
                          {totalLast4 > 0 ? formatVolume(totalLast4) : "—"}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">kg total</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="h-48 w-full flex items-end gap-2 mt-auto pb-6 relative">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full rounded-t-sm bg-surface-container-highest animate-pulse h-12"></div>
                      <span className="font-label-caps text-[10px] text-outline">—</span>
                    </div>
                  ))
                ) : last8.length === 0 ? (
                  <div className="w-full text-center text-on-surface-variant font-body-md">No volume data yet.</div>
                ) : (
                  last8.map((week, i) => {
                    const isMax = week.volume === maxVol;
                    const height = (week.volume / maxVol) * 100;
                    const label = formatDate(week.week_start);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 group/bar cursor-pointer">
                        <div
                          className={`w-full rounded-t-sm ${isMax ? "bg-primary" : "bg-surface-container-highest group-hover/bar:bg-outline-variant"} transition-colors`}
                          style={{ height: `${height}%`, minHeight: "4px" }}
                        ></div>
                        <span className={`font-label-caps text-[10px] ${isMax ? "text-primary font-semibold" : "text-outline"}`}>
                          {label}
                        </span>
                      </div>
                    );
                  })
                )}
                {last8.length > 0 && (
                  <div className="absolute top-4 right-0 max-w-[140px] bg-surface/90 backdrop-blur border border-outline-variant p-3 rounded-lg shadow-sm hidden md:block">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-[14px] text-secondary-container">psychology</span>
                      <span className="font-label-caps text-[10px] text-secondary-container font-semibold">Insight</span>
                    </div>
                    <p className="font-body-md text-[11px] leading-tight text-on-surface">
                      {maxVol > 0 && last8.length > 1 && last8[last8.length - 1].volume > last8[0].volume
                        ? "Volume trending upward. Keep pushing."
                        : "Consistent volume builds strength."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Consistency Map */}
            <div className="md:col-span-6 bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col group hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-metric-sm text-metric-sm text-on-surface-variant uppercase tracking-wider mb-1">Consistency Map</h3>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <div className="animate-pulse h-8 w-16 bg-surface-container rounded"></div>
                    ) : (
                      <>
                        <span className="font-headline-lg text-headline-lg text-primary">{totalWorkouts}</span>
                        <span className="font-body-md text-body-md text-on-surface-variant">active days</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-label-caps text-outline">Less</span>
                  <div className="w-2 h-2 rounded-sm bg-surface-container-highest"></div>
                  <div className="w-2 h-2 rounded-sm bg-outline-variant"></div>
                  <div className="w-2 h-2 rounded-sm bg-outline"></div>
                  <div className="w-2 h-2 rounded-sm bg-primary"></div>
                  <span className="text-[10px] font-label-caps text-outline">More</span>
                </div>
              </div>
              <div className="mt-auto overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-2">
                {loading ? (
                  <div className="grid grid-cols-[repeat(12,_minmax(16px,_1fr))] gap-1.5 min-w-[300px]">
                    {Array.from({ length: 12 * 7 }).map((_, i) => (
                      <div key={i} className="w-full aspect-square rounded-sm bg-surface-container-highest animate-pulse"></div>
                    ))}
                  </div>
                ) : gridCells.length === 0 ? (
                  <div className="text-center text-on-surface-variant font-body-md">No consistency data.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-[repeat(12,_minmax(16px,_1fr))] gap-1.5 min-w-[300px]">
                      {gridCells.map((val, idx) => (
                        <div key={idx} className={`w-full aspect-square rounded-sm ${getColor(val)}`} />
                      ))}
                    </div>
                    <div className="col-span-12 flex justify-between text-[10px] font-label-caps text-outline mt-2">
                      <span>12 weeks</span>
                      <span>Now</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}