"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";

type PatternType =
  | "progress"
  | "plateau"
  | "regression"
  | "volume_change"
  | "consistency"
  | "milestone";

interface Evidence {
  pattern?: Record<string, unknown>;
  recommendation?: string;
  recommendation_from_ai?: boolean;
  _source?: "ai_interpreted" | "deterministic";
  [key: string]: unknown;
}

interface Pattern {
  type: PatternType;
  exercise_slug: string | null;
  title: string;
  summary: string;
  evidence: Evidence;
  confidence: number;
  window: {
    start: string | null;
    end: string | null;
  };
}

interface AiInsight {
  id: number;
  type: string;
  title: string;
  summary: string;
  evidence: Evidence;
  confidence: number;
  time_range_start: string | null;
  time_range_end: string | null;
  generated_at: string;
}

interface InsightsResponse {
  insights: {
    data: AiInsight[];
    current_page: number;
    last_page: number;
  };
  detected_patterns: Pattern[];
}

interface E1rmPoint {
  date: string;
  e1rm: number;
}

interface E1rmSeries {
  slug: string;
  name: string;
  points: E1rmPoint[];
}

interface ProgressResponse {
  e1rm_trend: E1rmSeries[];
}

/**
 * One card in the feed, whichever source it came from.
 *
 * Patterns and persisted insights describe the same findings in slightly
 * different shapes; normalising both here means the render path has a single
 * type to deal with instead of a union it has to narrow at every field.
 */
interface FeedEntry {
  key: string;
  type: string;
  title: string;
  summary: string;
  evidence: Evidence;
  confidence: number;
  isAi: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; labelKey: string }> = {
  progress: { icon: "trending_up", color: "text-secondary", labelKey: "insights.typeProgress" },
  plateau: {
    icon: "horizontal_rule",
    color: "text-on-surface-variant",
    labelKey: "insights.typePlateau",
  },
  regression: { icon: "trending_down", color: "text-error", labelKey: "insights.typeRegression" },
  volume_change: {
    icon: "stacked_bar_chart",
    color: "text-secondary",
    labelKey: "insights.volumeChange",
  },
  consistency: {
    icon: "event_available",
    color: "text-secondary",
    labelKey: "insights.typeConsistency",
  },
  milestone: { icon: "emoji_events", color: "text-secondary", labelKey: "insights.typeMilestone" },
};

const FALLBACK_TYPE = {
  icon: "psychology",
  color: "text-on-surface-variant",
  labelKey: "insights.detectedPattern",
};

/** Keys that describe the finding itself rather than a measurement. */
const META_KEYS = new Set(["pattern", "recommendation", "recommendation_from_ai", "_source"]);

function isMetaKey(key: string): boolean {
  return META_KEYS.has(key) || key.startsWith("_");
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeSlug(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A single measurement as display text, or null when it cannot be shown.
 *
 * Objects and arrays return null rather than being coerced. `String({})` is the
 * literal "[object Object]" the evidence block used to print, and an array of
 * raw values is no more readable — omitting them is better than showing noise.
 */
function formatMetric(key: string, value: unknown, locale: string): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    // Percentage-shaped keys get a suffix so the number is not read as a count.
    if (/(^|_)(pct|percent|percentage|delta_pp)($|_)/.test(key)) {
      return `${value.toFixed(1)}%`;
    }
    if (Number.isInteger(value)) return value.toLocaleString(locale);
    return value.toLocaleString(locale, { maximumFractionDigits: 1 });
  }

  if (typeof value === "boolean") return value ? "✓" : "—";

  if (typeof value === "string") {
    if (key === "exercise_slug") return humanizeSlug(value);
    return value;
  }

  return null;
}

/**
 * The measurements behind a finding, as label/value pairs.
 *
 * The API nests the originating pattern under `evidence.pattern`, and the
 * actual numbers live one level deeper still in `pattern.evidence`. Reading
 * only the top level is what produced the raw key dump and the "[object Object]"
 * the cards used to show.
 */
function collectMetrics(
  evidence: Evidence,
  locale: string
): { key: string; label: string; value: string }[] {
  const pattern = (evidence.pattern ?? {}) as Record<string, unknown>;
  const nested = (pattern.evidence ?? {}) as Record<string, unknown>;

  const from = (source: Record<string, unknown>) => {
    const out: { key: string; label: string; value: string }[] = [];
    for (const [key, value] of Object.entries(source)) {
      if (isMetaKey(key)) continue;
      const formatted = formatMetric(key, value, locale);
      if (formatted !== null) out.push({ key, label: humanizeKey(key), value: formatted });
    }
    return out;
  };

  const nestedEntries = from(nested);
  if (nestedEntries.length > 0) return nestedEntries;

  // A pattern that carries no nested payload (or an insight saved before the
  // nesting existed) still has its own scalar evidence worth showing.
  return from(evidence);
}

/**
 * Identity for deduplication across the two sources.
 *
 * The same achievement is generated twice — once as a live pattern and once as
 * a persisted insight — with different wording ("10 Workouts Milestone – …"
 * versus "10 Workouts Completed – …"). The count is what actually identifies
 * the achievement, so it stands in for the wording.
 */
function dedupeKey(entry: { type: string; exerciseSlug: string | null; title: string }): string {
  const count = entry.title.match(/\d+/)?.[0] ?? "";
  return `${entry.type}|${entry.exerciseSlug ?? ""}|${count}`;
}

function getConfidenceLevel(score: number): { labelKey: string; color: string } {
  if (score >= 0.75) return { labelKey: "insights.confidenceHigh", color: "bg-secondary" };
  if (score >= 0.5) return { labelKey: "insights.confidenceMedium", color: "bg-secondary-container" };
  return { labelKey: "insights.confidenceLow", color: "bg-outline-variant" };
}

function formatPeriod(start: string | null, end: string | null, locale: string): string | null {
  if (!start || !end) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (!a || !b) return null;
  return `${a} – ${b}`;
}

const CHART_W = 400;
const CHART_H = 200;
const CHART_PAD = { top: 12, bottom: 18, left: 8, right: 8 };
const INNER_W = CHART_W - CHART_PAD.left - CHART_PAD.right;
const INNER_H = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrendChart {
  linePoints: string;
  areaPath: string;
  projection: { x1: number; y1: number; x2: number; y2: number };
  dots: { x: number; y: number }[];
  ticks: { topPct: number; value: number }[];
  maxValue: number;
  minValue: number;
}

/**
 * Trend line and a projected continuation.
 *
 * The projection is a least-squares fit across every session rather than an
 * extension of the final segment. A single heavy or light session at the end
 * would otherwise set the direction of the whole forecast.
 *
 * Both ends of the projected segment are clamped to the plot box: extrapolating
 * a steep fit thirty days out lands well outside the frame, and the line would
 * appear to escape the chart.
 */
function buildTrend(points: E1rmPoint[]): TrendChart {
  const values = points.map((p) => p.e1rm);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const min = rawMin - span * 0.15;
  const max = rawMax + span * 0.15;

  const times = points.map((p) => new Date(p.date).getTime());
  const firstT = times[0];
  const lastT = times[times.length - 1];
  const timeSpan = lastT - firstT || DAY_MS;

  const mapX = (ms: number) => CHART_PAD.left + ((ms - firstT) / timeSpan) * INNER_W;
  const mapY = (v: number) => CHART_PAD.top + INNER_H - ((v - min) / (max - min)) * INNER_H;

  const dots = points.map((p, i) => ({ x: mapX(times[i]), y: mapY(p.e1rm) }));
  const linePoints = dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");

  const floor = CHART_PAD.top + INNER_H;
  const areaPath = `${linePoints
    .split(" ")
    .map((pair, i) => `${i === 0 ? "M" : "L"}${pair}`)
    .join(" ")} L${dots[dots.length - 1].x.toFixed(1)},${floor} L${dots[0].x.toFixed(1)},${floor} Z`;

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

  const last = dots[dots.length - 1];
  const projection = {
    x1: last.x,
    y1: last.y,
    x2: Math.min(CHART_PAD.left + INNER_W, mapX(projectedT)),
    y2: Math.max(CHART_PAD.top, Math.min(floor, mapY(projectedV))),
  };

  const ticks = [0, 1, 2, 3].map((i) => {
    const value = min + ((max - min) * (3 - i)) / 3;
    return { topPct: (mapY(value) / CHART_H) * 100, value };
  });

  return { linePoints, areaPath, projection, dots, ticks, maxValue: rawMax, minValue: rawMin };
}

export default function InsightsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [trendSeries, setTrendSeries] = useState<E1rmSeries | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, progressRes] = await Promise.all([
        apiClient.get<InsightsResponse>("/insights"),
        apiClient.get<ProgressResponse>("/analytics/progress?days=90"),
      ]);

      setPatterns(insightsRes.detected_patterns || []);
      setInsights(insightsRes.insights?.data || []);

      const series = (progressRes.e1rm_trend || []).find(
        (s) => s.points && s.points.length >= 2
      );
      setTrendSeries(series || null);
    } catch (err) {
      if (err instanceof Error && "status" in err && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const feed = useMemo<FeedEntry[]>(() => {
    const byKey = new Map<string, FeedEntry>();

    for (const p of patterns) {
      const key = dedupeKey({ type: p.type, exerciseSlug: p.exercise_slug, title: p.title });
      byKey.set(key, {
        key,
        type: p.type,
        title: p.title,
        summary: p.summary,
        evidence: p.evidence ?? {},
        confidence: p.confidence,
        isAi: false,
        periodStart: p.window?.start ?? null,
        periodEnd: p.window?.end ?? null,
      });
    }

    /*
     * Persisted insights are written after the live patterns so they win any
     * collision: the same finding arrives from both sources, and the persisted
     * one carries the coach recommendation the pattern does not have.
     */
    for (const i of insights) {
      const key = dedupeKey({ type: i.type, exerciseSlug: null, title: i.title });
      byKey.set(key, {
        key,
        type: i.type,
        title: i.title,
        summary: i.summary,
        evidence: i.evidence ?? {},
        confidence: i.confidence,
        isAi: true,
        periodStart: i.time_range_start,
        periodEnd: i.time_range_end,
      });
    }

    return Array.from(byKey.values());
  }, [patterns, insights]);

  const chart = useMemo(
    () => (trendSeries && trendSeries.points.length >= 2 ? buildTrend(trendSeries.points) : null),
    [trendSeries]
  );

  const avgConfidence = feed.length
    ? feed.reduce((sum, f) => sum + f.confidence, 0) / feed.length
    : null;

  const hasContent = feed.length > 0;

  const renderCard = (entry: FeedEntry) => {
    const config = TYPE_CONFIG[entry.type] ?? FALLBACK_TYPE;
    const metrics = collectMetrics(entry.evidence, locale);
    const recommendation =
      typeof entry.evidence.recommendation === "string" ? entry.evidence.recommendation : null;
    const period = formatPeriod(entry.periodStart, entry.periodEnd, locale);
    const level = getConfidenceLevel(entry.confidence);
    const isDeterministic = entry.evidence._source === "deterministic";

    return (
      <article
        key={entry.key}
        className={`bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-4 transition-shadow duration-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] ${
          entry.isAi ? "ai-glow" : ""
        }`}
      >
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-label-caps text-label-caps uppercase tracking-widest flex items-center gap-1 ${config.color}`}
            >
              <span className="material-symbols-outlined text-[16px]">{config.icon}</span>
              {t(config.labelKey)}
            </span>
            {entry.isAi && (
              <span className="bg-secondary/10 text-secondary font-label-caps px-2 py-0.5 rounded text-[10px] uppercase">
                {isDeterministic ? t("insights.deterministic") : t("insights.aiInterpreted")}
              </span>
            )}
            {period && (
              <span className="font-label-caps text-label-caps text-outline ml-auto text-[10px]">
                {period}
              </span>
            )}
          </div>
          <h3 className="font-headline-lg-mobile md:text-headline-lg text-primary leading-tight">
            {entry.title}
          </h3>
        </header>

        <p className="font-body-md text-body-md text-on-surface-variant">{entry.summary}</p>

        {recommendation && (
          <div className="rounded-lg bg-secondary-fixed/20 border border-secondary-fixed p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                tips_and_updates
              </span>
              <span className="font-label-caps text-label-caps uppercase text-secondary">
                {t("insights.recommendation")}
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface">{recommendation}</p>
          </div>
        )}

        {metrics.length > 0 && (
          <div className="border-t border-outline-variant pt-4">
            <div className="font-label-caps text-label-caps text-outline uppercase mb-3">
              {t("insights.evidence")}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {metrics.map((m) => (
                <div key={m.key} className="min-w-0">
                  <div className="font-label-caps text-label-caps text-outline truncate">
                    {m.label}
                  </div>
                  <div className="font-metric-sm text-metric-sm text-primary truncate">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-outline-variant pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-outline uppercase">
              {t("insights.confidence")}
            </span>
            <span className="font-metric-sm text-metric-sm text-on-surface-variant">
              {t(level.labelKey)} · {Math.round(entry.confidence * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
            <div
              className={`h-full rounded-full ${level.color}`}
              style={{ width: `${Math.round(Math.max(0, Math.min(1, entry.confidence)) * 100)}%` }}
            />
          </div>
        </div>
      </article>
    );
  };

  const renderChart = () => {
    if (!chart || !trendSeries) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center text-on-surface-variant font-body-md text-center">
          <span className="material-symbols-outlined text-4xl text-outline mb-2">show_chart</span>
          {t("insights.notEnoughData")}
          <div className="text-sm text-outline mt-1">{t("insights.unlockHint")}</div>
        </div>
      );
    }

    const points = trendSeries.points;
    const firstDate = new Date(points[0].date);
    const lastDate = new Date(points[points.length - 1].date);

    return (
      <div className="relative h-full w-full">
        {/*
          Axis values are HTML positioned over the plot rather than <text> inside
          it: the SVG stretches with preserveAspectRatio="none", which would
          stretch any glyphs drawn in its coordinate space along with the line.
        */}
        <div className="pointer-events-none absolute inset-0">
          {chart.ticks.map((tick) => (
            <div
              key={tick.value}
              className="absolute left-0 right-0 flex items-center gap-2"
              style={{ top: `${tick.topPct}%` }}
            >
              <span className="w-8 shrink-0 text-right font-label-caps text-[10px] text-outline">
                {Math.round(tick.value)}
              </span>
              <span className="h-px flex-1 bg-outline-variant/40" />
            </div>
          ))}
        </div>

        <svg
          className="absolute inset-0 h-full w-full overflow-hidden"
          preserveAspectRatio="none"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        >
          <defs>
            <linearGradient id="insightTrendArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4648D4" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#4648D4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={chart.areaPath} fill="url(#insightTrendArea)" />
          <polyline
            points={chart.linePoints}
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={chart.projection.x1}
            y1={chart.projection.y1}
            x2={chart.projection.x2}
            y2={chart.projection.y2}
            className="stroke-secondary"
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {chart.dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={i === chart.dots.length - 1 ? 4 : 2.5}
              fill={i === chart.dots.length - 1 ? "#4648D4" : "#1C1B1B"}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        <div className="absolute -bottom-6 left-0 right-0 flex items-center justify-between gap-3 pl-10">
          <span className="font-label-caps text-[10px] text-outline">
            {firstDate.toLocaleDateString(locale, { month: "short", day: "numeric" })}
          </span>
          <span className="flex items-center gap-1.5 font-label-caps text-[10px] text-secondary">
            <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-secondary" />
            {t("insights.projected")}
          </span>
          <span className="font-label-caps text-[10px] text-outline">
            {lastDate.toLocaleDateString(locale, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-8 animate-fadeIn">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="font-metric-display text-headline-lg-mobile md:text-metric-display text-primary tracking-tight flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary text-[40px]">psychology</span>
              {t("insights.feed")}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-2xl">
              {t("insights.feedBody")}
            </p>
          </div>

          {!loading && hasContent && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface border border-outline-variant rounded-xl px-4 py-3">
                <div className="font-label-caps text-label-caps text-outline uppercase">
                  {t("insights.detectedPattern")}
                </div>
                <div className="font-headline-lg text-headline-lg text-primary mt-1">
                  {feed.filter((f) => !f.isAi).length}
                </div>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl px-4 py-3">
                <div className="font-label-caps text-label-caps text-outline uppercase">
                  {t("insights.aiInterpreted")}
                </div>
                <div className="font-headline-lg text-headline-lg text-primary mt-1">
                  {feed.filter((f) => f.isAi).length}
                </div>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl px-4 py-3 col-span-2 sm:col-span-1">
                <div className="font-label-caps text-label-caps text-outline uppercase">
                  {t("insights.confidence")}
                </div>
                <div className="font-headline-lg text-headline-lg text-primary mt-1">
                  {avgConfidence !== null ? `${Math.round(avgConfidence * 100)}%` : "—"}
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 flex flex-col gap-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-surface border border-outline-variant rounded-xl p-6 animate-pulse"
                >
                  <div className="h-4 w-1/4 bg-surface-container-low rounded mb-4" />
                  <div className="h-6 w-3/4 bg-surface-container-low rounded mb-4" />
                  <div className="h-4 w-full bg-surface-container-low rounded mb-2" />
                  <div className="h-4 w-2/3 bg-surface-container-low rounded" />
                </div>
              ))
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="font-body-md text-body-md text-on-surface-variant">{error}</div>
                <button
                  onClick={fetchData}
                  className="px-6 py-2 bg-primary text-on-primary rounded-full font-metric-sm text-metric-sm hover:bg-primary/80 transition-colors"
                >
                  {t("action.retry")}
                </button>
              </div>
            ) : !hasContent ? (
              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center text-center gap-4">
                <span className="material-symbols-outlined text-4xl text-outline">psychology</span>
                <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                  {t("insights.empty")}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                  {t("insights.emptyFeedBody")}
                </p>
                <a
                  href="/workout"
                  className="px-6 py-2 bg-primary text-on-primary rounded-full font-metric-sm text-metric-sm hover:bg-primary/80 transition-colors"
                >
                  {t("workout.startWorkout")}
                </a>
              </div>
            ) : (
              feed.map(renderCard)
            )}
          </div>

          {/* Stacks below the feed on mobile rather than being hidden: the trend
              is the reason the page exists, so it cannot be desktop-only. */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-surface border border-outline-variant rounded-xl p-6 lg:p-8 lg:sticky lg:top-6 lg:self-start w-full">
              <div className="flex flex-col gap-1">
                <h3 className="font-metric-sm text-metric-sm text-primary text-xl">
                  {t("insights.macroTrend")}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {trendSeries
                    ? t("insights.macroTrendBody", { name: trendSeries.name })
                    : t("insights.unlockHint")}
                </p>
              </div>
              <div className="mt-6 h-64 lg:h-72 w-full relative border-b border-l border-outline-variant/30 pb-8 pl-2">
                {loading ? (
                  <div className="animate-pulse h-full w-full bg-surface-container rounded" />
                ) : (
                  renderChart()
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
