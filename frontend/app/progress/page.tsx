"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";

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

const DAY_MS = 24 * 60 * 60 * 1000;

// Plot geometry. The SVG keeps a fixed viewBox and stretches to its container,
// so every label is rendered as HTML on top rather than as <text> inside the
// SVG — text inside a preserveAspectRatio="none" box would be stretched with it.
const PLOT_W = 600;
const PLOT_H = 200;
const PAD = { top: 16, bottom: 24, left: 6, right: 6 };
const INNER_W = PLOT_W - PAD.left - PAD.right;
const INNER_H = PLOT_H - PAD.top - PAD.bottom;

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

type ChartGeometry = {
  dots: { x: number; y: number }[];
  pathD: string;
  areaD: string;
  projectionD: string;
  ticks: { topPct: number; value: number }[];
};

/**
 * Trend line plus a projected continuation.
 *
 * The Y domain spans the data with padding rather than starting at zero. A
 * zero-based axis turns a normal week-to-week wobble into what looks like a
 * collapse to the floor, because the interesting range is a small band near the
 * top of a 0..max scale.
 *
 * The projection is a least-squares fit across every point, not an extension of
 * the final segment. One unusually heavy or light session would otherwise decide
 * the direction of the whole forecast.
 */
function buildChart(points: E1rmPoint[]): ChartGeometry {
  const values = points.map((p) => p.e1rm);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A flat series would leave a zero-height domain; give it one so the line
  // still reads as a line instead of collapsing onto a single row.
  const span = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;

  const times = points.map((p) => new Date(p.date).getTime());
  const firstT = times[0];
  const lastT = times[times.length - 1];
  const timeSpan = lastT - firstT || DAY_MS;

  const mapX = (t: number) => PAD.left + ((t - firstT) / timeSpan) * INNER_W;
  const mapY = (v: number) => PAD.top + INNER_H - ((v - min) / (max - min)) * INNER_H;

  const dots = points.map((p, i) => ({ x: mapX(times[i]), y: mapY(p.e1rm) }));

  const pathD = dots
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const floor = PAD.top + INNER_H;
  const areaD = `${pathD} L${dots[dots.length - 1].x.toFixed(1)},${floor} L${dots[0].x.toFixed(1)},${floor} Z`;

  const n = points.length;
  const meanX = times.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (times[i] - meanX) * (values[i] - meanY);
    den += (times[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;

  const projectedT = lastT + 30 * DAY_MS;
  const projectedV = meanY + slope * (projectedT - meanX);

  // Clamped to the box: a steep fit would otherwise draw past the edge and look
  // like the forecast escapes the chart.
  const projX = Math.min(PAD.left + INNER_W, mapX(projectedT));
  const projY = Math.max(PAD.top, Math.min(floor, mapY(projectedV)));

  const last = dots[dots.length - 1];
  const projectionD = `M${last.x.toFixed(1)},${last.y.toFixed(1)} L${projX.toFixed(1)},${projY.toFixed(1)}`;

  const ticks = [0, 1, 2, 3].map((i) => {
    const value = min + ((max - min) * (3 - i)) / 3;
    return { topPct: (mapY(value) / PLOT_H) * 100, value };
  });

  return { dots, pathD, areaD, projectionD, ticks };
}

export default function ProgressPage() {
  const { t, locale } = useTranslation();
  const { label, formatWeight, formatVolume } = useUnit();
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
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
    /*
     * `t` belongs here: the catch above uses it for the fallback message, and
     * `t` changes identity when the language does — so this callback must be
     * rebuilt then, or a failed load would report in the old language.
     */
  }, [periodDays, router, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData, reloadKey]);

  const handleRetry = () => setReloadKey((k) => k + 1);

  // ---- Strength trend ----
  const e1rmSeries = data?.e1rm_trend?.find((s) => s.points.length >= 2) ?? null;
  const e1rmPoints = e1rmSeries?.points ?? [];
  const latestE1rm = e1rmPoints.length > 0 ? e1rmPoints[e1rmPoints.length - 1].e1rm : null;
  const firstE1rm = e1rmPoints.length > 0 ? e1rmPoints[0].e1rm : null;
  const delta =
    firstE1rm && latestE1rm ? ((latestE1rm - firstE1rm) / firstE1rm) * 100 : null;

  const peakPoint = useMemo(() => {
    if (e1rmPoints.length === 0) return null;
    return e1rmPoints.reduce((best, p) => (p.e1rm > best.e1rm ? p : best), e1rmPoints[0]);
  }, [e1rmPoints]);

  const chart = useMemo(
    () => (e1rmPoints.length >= 2 ? buildChart(e1rmPoints) : null),
    [e1rmPoints]
  );

  // ---- Frequency and adherence ----
  const frequencyData = data?.frequency_weekly ?? [];
  const totalWorkouts = frequencyData.reduce((sum, w) => sum + w.workouts, 0);
  const avgSessions = frequencyData.length > 0 ? totalWorkouts / frequencyData.length : null;
  const adherence = data?.consistency?.adherence_pct ?? null;
  const targetDays = data?.consistency?.target_days ?? null;
  const avgSessionsVal = data?.consistency?.avg_sessions_per_week ?? avgSessions;
  const diff =
    avgSessionsVal !== null && targetDays !== null ? avgSessionsVal - targetDays : null;

  // Consecutive weeks with at least one finished session, counted back from the
  // most recent week — a streak that has already been broken this week still
  // counts the weeks behind it.
  const streak = useMemo(() => {
    let count = 0;
    for (let i = frequencyData.length - 1; i >= 0; i--) {
      if (frequencyData[i].workouts > 0) count++;
      else break;
    }
    return count;
  }, [frequencyData]);

  const trainedDays = (data?.volume_by_day ?? []).filter((d) => d.volume > 0).length;

  const ringRadius = 44;
  const circumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    adherence !== null ? circumference * (1 - Math.max(0, Math.min(100, adherence)) / 100) : circumference;

  // ---- Weekly volume ----
  const weeklyVolumes = data?.volume_by_week ?? [];
  const last8 = weeklyVolumes.slice(-8);
  // Guarded against an all-zero window, which would otherwise divide by zero and
  // render every bar at NaN%.
  const maxVol = Math.max(1, ...last8.map((w) => w.volume));
  const totalLast4 = weeklyVolumes.slice(-4).reduce((sum, w) => sum + w.volume, 0);
  const volumeTrendingUp =
    last8.length > 1 && last8[last8.length - 1].volume > last8[0].volume;

  // ---- Activity strip ----
  const maxWeekWorkouts = Math.max(1, ...frequencyData.map((w) => w.workouts));

  const intensityClass = (workouts: number) => {
    if (workouts === 0) return "bg-surface-container-highest";
    if (workouts >= 4) return "bg-secondary";
    if (workouts >= 2) return "bg-secondary-container";
    return "bg-secondary-fixed-dim";
  };

  const cardClass =
    "bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col transition-shadow duration-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)]";

  return (
    <AppLayout>
      <div className="flex flex-col gap-8 animate-fadeIn">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h2 className="font-metric-display text-headline-lg-mobile md:text-metric-display text-primary tracking-tight">
              {t("progress.title")}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-lg">
              {t("progress.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 bg-surface-container-low rounded-lg p-1 border border-outline-variant">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriodDays(p.days)}
                aria-pressed={periodDays === p.days}
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
              {t("action.retry")}
            </button>
          </div>
        )}

        {!error && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
            {/* Strength trend — the hero card */}
            <div className="md:col-span-8 ai-glow bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                      {t("progress.estimated1rm")}
                    </h3>
                    {chart && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-secondary-container"
                        title={t("progress.aiPredicted")}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-3">
                    {loading ? (
                      <div className="animate-pulse h-12 w-32 bg-surface-container rounded" />
                    ) : (
                      <>
                        <span className="font-metric-display text-metric-display text-primary">
                          {latestE1rm !== null ? formatWeight(latestE1rm) : "—"}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">
                          {label}
                        </span>
                        {delta !== null && Math.abs(delta) >= 0.1 && (
                          <span
                            className={`font-metric-sm text-metric-sm px-2 py-0.5 rounded ${
                              delta > 0
                                ? "text-secondary bg-secondary-fixed/40"
                                : "text-error bg-error-container/40"
                            }`}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {e1rmSeries && (
                    <p className="font-body-md text-body-md text-on-surface-variant mt-2 text-sm">
                      {e1rmSeries.name}
                    </p>
                  )}
                </div>

                {/* Secondary readings: the number above is today's, these are
                    the reference points a lifter actually checks against it. */}
                {!loading && e1rmPoints.length >= 2 && (
                  <div className="hidden sm:flex shrink-0 gap-6 text-right">
                    <div>
                      <div className="font-label-caps text-label-caps text-outline uppercase">
                        {t("progress.peak")}
                      </div>
                      <div className="font-metric-sm text-metric-sm text-primary">
                        {peakPoint ? `${formatWeight(peakPoint.e1rm)} ${label}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="font-label-caps text-label-caps text-outline uppercase">
                        {t("progress.bestSet")}
                      </div>
                      <div className="font-metric-sm text-metric-sm text-primary">
                        {peakPoint
                          ? `${formatWeight(peakPoint.weight)} ${label} × ${peakPoint.reps}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 h-64 w-full relative">
                {loading ? (
                  <div className="animate-pulse h-full w-full bg-surface-container rounded" />
                ) : !chart ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-on-surface-variant font-body-md border border-dashed border-outline-variant rounded">
                    <span className="material-symbols-outlined text-4xl mb-2">insights</span>
                    <p>{t("progress.noStrength")}</p>
                    <p className="text-sm">{t("progress.startTrend")}</p>
                  </div>
                ) : (
                  <>
                    {/* Y ticks as HTML, positioned by percentage of the plot box */}
                    <div className="pointer-events-none absolute inset-0">
                      {chart.ticks.map((tick) => (
                        <div
                          key={tick.value}
                          className="absolute left-0 right-0 flex items-center gap-2"
                          style={{ top: `${tick.topPct}%` }}
                        >
                          <span className="w-9 shrink-0 text-right font-label-caps text-[10px] text-outline">
                            {Math.round(tick.value)}
                          </span>
                          <span className="h-px flex-1 bg-outline-variant/40" />
                        </div>
                      ))}
                    </div>

                    <svg
                      className="absolute inset-0 h-full w-full"
                      preserveAspectRatio="none"
                      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
                    >
                      <defs>
                        <linearGradient id="e1rmArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#4648D4" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#4648D4" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={chart.areaD} fill="url(#e1rmArea)" />
                      <path
                        d={chart.pathD}
                        fill="none"
                        className="stroke-primary"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={chart.projectionD}
                        fill="none"
                        className="stroke-secondary"
                        strokeWidth="2"
                        strokeDasharray="5 5"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {chart.dots.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={i === chart.dots.length - 1 ? 4 : 2.5}
                          fill={i === chart.dots.length - 1 ? "#4648D4" : "#1C1B1B"}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                      ))}
                    </svg>
                  </>
                )}
              </div>

              {!loading && chart && (
                <div className="mt-2 flex items-center justify-between gap-3 pl-11">
                  <span className="font-label-caps text-label-caps text-outline text-[10px]">
                    {formatDate(e1rmPoints[0].date, locale)}
                  </span>
                  <span className="font-label-caps text-label-caps text-[10px] text-secondary flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-secondary" />
                    {t("progress.projected")}
                  </span>
                  <span className="font-label-caps text-label-caps text-outline text-[10px]">
                    {formatDate(e1rmPoints[e1rmPoints.length - 1].date, locale)}
                  </span>
                </div>
              )}
            </div>

            {/* Adherence ring */}
            <div className={`md:col-span-4 ${cardClass}`}>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                {t("progress.weeklyFrequency")}
              </h3>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <div className="animate-pulse h-8 w-20 bg-surface-container rounded" />
                ) : (
                  <>
                    <span className="font-headline-lg text-headline-lg text-primary">
                      {avgSessionsVal !== null ? avgSessionsVal.toFixed(1) : "—"}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      {t("progress.avgPerWeek")}
                    </span>
                  </>
                )}
              </div>

              <div className="flex-1 flex items-center justify-center py-6">
                {loading ? (
                  <div className="animate-pulse w-40 h-40 rounded-full bg-surface-container" />
                ) : (
                  <div className="relative w-40 h-40">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r={ringRadius}
                        fill="none"
                        stroke="#EBE7E6"
                        strokeWidth="8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r={ringRadius}
                        fill="none"
                        stroke="#4648D4"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={ringOffset}
                        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-metric-display text-[32px] font-semibold text-primary leading-none">
                        {adherence !== null ? Math.round(adherence) : "—"}
                        {adherence !== null && <span className="text-lg">%</span>}
                      </span>
                      <span className="font-label-caps text-label-caps text-on-surface-variant mt-1">
                        {t("progress.adherence")}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center gap-3 text-sm border-t border-outline-variant pt-3">
                <span className="text-on-surface-variant">
                  {t("progress.target")}:{" "}
                  {targetDays !== null
                    ? `${targetDays} ${t("profile.daysPerWeek")}`
                    : t("progress.setInProfile")}
                </span>
                {diff !== null && Math.abs(diff) >= 0.05 && (
                  <span
                    className={`font-metric-sm text-metric-sm px-2 py-0.5 rounded ${
                      diff < 0
                        ? "text-error bg-error-container/40"
                        : "text-secondary bg-secondary-fixed/40"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Stat strip */}
            <div className="md:col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { labelKey: "progress.totalWorkouts", value: String(totalWorkouts) },
                { labelKey: "progress.trainedDays", value: String(trainedDays) },
                { labelKey: "progress.streak", value: `${streak} ${t("progress.weekStreak")}` },
                {
                  labelKey: "progress.volumeTrend",
                  value: totalLast4 > 0 ? formatVolume(totalLast4) : "—",
                },
              ].map((stat) => (
                <div
                  key={stat.labelKey}
                  className="bg-surface border border-outline-variant rounded-xl px-4 py-3"
                >
                  <div className="font-label-caps text-label-caps text-outline uppercase">
                    {t(stat.labelKey)}
                  </div>
                  <div className="font-metric-sm text-metric-sm text-primary mt-1 truncate">
                    {loading ? "—" : stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Weekly volume */}
            <div className={`md:col-span-6 ${cardClass}`}>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 mb-6">
                <div>
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                    {t("progress.weeklyVolume")}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <div className="animate-pulse h-8 w-24 bg-surface-container rounded" />
                    ) : (
                      <>
                        <span className="font-headline-lg text-headline-lg text-primary">
                          {totalLast4 > 0 ? formatVolume(totalLast4) : "—"}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">
                          {t("progress.volumeTotal", { unit: label })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {/*
                  Stacks under the heading on narrow screens. Held beside it with
                  shrink-0 the sentence could not wrap, so on a phone it pushed
                  past the viewport and gave the whole page a horizontal scroll.
                */}
                {!loading && last8.length > 1 && (
                  <span className="self-start flex items-center gap-1 font-label-caps text-label-caps text-secondary bg-secondary-fixed/30 rounded px-2 py-1">
                    <span className="material-symbols-outlined text-[14px]">
                      {volumeTrendingUp ? "trending_up" : "trending_flat"}
                    </span>
                    {volumeTrendingUp ? t("progress.trendUp") : t("progress.trendSteady")}
                  </span>
                )}
              </div>

              {/*
                The bar wrapper is a flex child of a fixed-height column, so its
                percentage-height bars resolve against a definite box. Against an
                indefinite (auto) parent a percentage height collapses to zero and
                only the min-height sliver would paint.
              */}
              <div className="h-48 w-full flex gap-2 mt-auto">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex-1 flex items-end">
                        <div className="w-full rounded-t-sm bg-surface-container-highest animate-pulse h-12" />
                      </div>
                      <span className="font-label-caps text-[10px] text-outline">—</span>
                    </div>
                  ))
                ) : last8.length === 0 ? (
                  <div className="w-full flex items-center justify-center text-on-surface-variant font-body-md">
                    {t("progress.noVolumeData")}
                  </div>
                ) : (
                  last8.map((week) => {
                    const isMax = week.volume === maxVol && week.volume > 0;
                    const height = (week.volume / maxVol) * 100;
                    return (
                      <div
                        key={week.week_start}
                        className="flex-1 min-w-0 flex flex-col items-center gap-2"
                      >
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-sm transition-colors ${
                              isMax
                                ? "bg-secondary"
                                : "bg-secondary-fixed-dim hover:bg-secondary-container"
                            }`}
                            style={{ height: `${Math.max(height, 2)}%` }}
                            title={`${formatVolume(week.volume)} ${label}`}
                          />
                        </div>
                        <span
                          className={`font-label-caps text-[10px] truncate ${
                            isMax ? "text-secondary" : "text-outline"
                          }`}
                        >
                          {formatDate(week.week_start, locale)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Activity strip */}
            <div className={`md:col-span-6 ${cardClass}`}>
              <div className="flex justify-between items-start gap-4 mb-6">
                <div>
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                    {t("progress.consistencyMap")}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <div className="animate-pulse h-8 w-20 bg-surface-container rounded" />
                    ) : (
                      <>
                        <span className="font-headline-lg text-headline-lg text-primary">
                          {totalWorkouts}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface-variant">
                          {t("progress.totalWorkouts")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-label-caps text-outline">
                    {t("progress.legendLess")}
                  </span>
                  <span className="w-2.5 h-2.5 rounded-sm bg-surface-container-highest" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-secondary-fixed-dim" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-secondary-container" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-secondary" />
                  <span className="text-[10px] font-label-caps text-outline">
                    {t("progress.legendMore")}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="h-40 flex gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-surface-container-highest animate-pulse"
                    />
                  ))}
                </div>
              ) : frequencyData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-on-surface-variant font-body-md">
                  {t("progress.noConsistencyData")}
                </div>
              ) : (
                <>
                  {/*
                    One column per week, drawn from the real weekly workout count.
                    The previous version stretched each week across seven fake
                    daily cells, which produced an all-black grid that carried no
                    information beyond the weekly totals it was built from.
                  */}
                  <div className="h-40 flex gap-1.5">
                    {frequencyData.map((week) => {
                      const pct = (week.workouts / maxWeekWorkouts) * 100;
                      return (
                        <div
                          key={week.week_start}
                          className="flex-1 min-w-0 flex flex-col items-center gap-2"
                        >
                          <div className="w-full flex-1 flex items-end">
                            <div
                              className={`w-full rounded-sm ${intensityClass(week.workouts)}`}
                              style={{ height: `${Math.max(pct, 3)}%` }}
                              title={`${week.workouts} ${t("progress.sessions")}`}
                            />
                          </div>
                          <span className="font-label-caps text-[9px] text-outline truncate w-full text-center">
                            {week.workouts}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-3 font-label-caps text-[10px] text-outline">
                    <span>{t("progress.weeks12")}</span>
                    <span>{t("progress.now")}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
