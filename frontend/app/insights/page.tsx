"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";

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
  // other fields ignored
}

const TYPE_CONFIG: Record<
  PatternType,
  { icon: string; color: string; label: string }
> = {
  progress: { icon: "trending_up", color: "text-secondary", label: "Progress" },
  plateau: {
    icon: "horizontal_rule",
    color: "text-on-surface-variant",
    label: "Plateau",
  },
  regression: { icon: "trending_down", color: "text-error", label: "Regression" },
  volume_change: {
    icon: "stacked_bar_chart",
    color: "text-secondary",
    label: "Volume Change",
  },
  consistency: {
    icon: "event_available",
    color: "text-secondary",
    label: "Consistency",
  },
  milestone: { icon: "emoji_events", color: "text-secondary", label: "Milestone" },
};

function getConfidenceLevel(score: number): {
  label: string;
  icon: string;
  color: string;
} {
  if (score >= 0.75)
    return { label: "High", icon: "check_circle", color: "text-secondary" };
  if (score >= 0.5)
    return { label: "Medium", icon: "info", color: "text-on-surface-variant" };
  return { label: "Low", icon: "warning", color: "text-on-surface-variant" };
}

function prettifyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  if (value === null || value === undefined) return "—";
  return String(value);
}

export default function InsightsPage() {
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

      // Find first e1rm_trend series with at least 2 points
      const series = (progressRes.e1rm_trend || []).find(
        (s) => s.points && s.points.length >= 2
      );
      setTrendSeries(series || null);
    } catch (err: any) {
      if (err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err.message || "Couldn't load insights.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasContent = patterns.length > 0 || insights.length > 0;

  // Render evidence block
  const renderEvidence = (evidence: Evidence) => {
    const entries = Object.entries(evidence).filter(
      ([, v]) => v !== null && v !== undefined
    );
    if (entries.length === 0) return null;
    const gridCols = entries.length >= 4 ? "grid-cols-2" : "grid-cols-1";
    return (
      <div className="border-t border-outline-variant pt-4 mt-4">
        <div className="font-metric-sm text-metric-sm text-primary flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-base">info</span>
          Why Striv thinks this
        </div>
        <div className={`bg-surface-container-low rounded-lg p-4 grid ${gridCols} gap-4`}>
          {entries.map(([key, value]) => (
            <div key={key}>
              <div className="font-label-caps text-label-caps text-outline mb-1">
                {prettifyKey(key)}
              </div>
              <div className="font-metric-sm text-metric-sm text-primary">
                {formatValue(value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render confidence footer
  const renderConfidence = (score: number) => {
    const level = getConfidenceLevel(score);
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="font-label-caps text-label-caps text-outline">
          Confidence
        </span>
        <span className={`font-metric-sm text-metric-sm ${level.color} flex items-center gap-1`}>
          <span className="material-symbols-outlined text-sm">{level.icon}</span>
          {level.label}
        </span>
      </div>
    );
  };

  // Render a single card (pattern or insight)
  const renderCard = (
    item: Pattern | AiInsight,
    isAi: boolean,
    key: string | number
  ) => {
    const type = item.type as PatternType;
    const config = TYPE_CONFIG[type] || {
      icon: "psychology",
      color: "text-secondary",
      label: type,
    };
    const title = item.title;
    const summary = item.summary;
    const evidence = item.evidence;
    const confidence = item.confidence;

    return (
      <article
        key={key}
        className="bg-surface border border-primary/20 rounded-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ai-glow relative overflow-hidden flex flex-col gap-4 cursor-pointer hover:shadow-lg transition-shadow"
      >
        <div className="absolute top-0 right-0 p-4">
          <div className="w-2 h-2 rounded-full bg-secondary"></div>
        </div>
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`font-label-caps text-label-caps ${config.color} uppercase tracking-widest flex items-center gap-1`}
            >
              <span className="material-symbols-outlined text-sm">
                {config.icon}
              </span>
              {config.label}
            </span>
            {isAi && (
              <span className="bg-secondary/10 text-secondary font-label-caps px-2 py-0.5 rounded text-xs">
                AI
              </span>
            )}
          </div>
          <h3 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary leading-tight">
            {title}
          </h3>
        </header>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {summary}
        </p>
        {isAi && item.evidence?.recommendation && (
          <div className="mt-4 p-3 rounded-lg bg-secondary-fixed/10 border border-secondary-fixed/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-secondary text-[18px]">tips_and_updates</span>
              <span className="font-label-caps text-label-caps uppercase text-secondary">Recommendation</span>
              {item.evidence?._source === "deterministic" && (
                <span className="font-label-caps text-label-caps text-on-surface-variant text-[10px] ml-auto">deterministic</span>
              )}
            </div>
            <p className="font-body-md text-body-md text-on-surface">{item.evidence.recommendation}</p>
          </div>
        )}
        {renderEvidence(evidence)}
        {renderConfidence(confidence)}
      </article>
    );
  };

  // Build feed: patterns first, then insights
  const feedItems = [
    ...patterns.map((p) => ({ ...p, _isAi: false })),
    ...insights.map((i) => ({ ...i, _isAi: true })),
  ];

  // --- SVG chart helpers ---
  const renderChart = () => {
    if (!trendSeries || trendSeries.points.length < 2) {
      return (
        <div className="h-64 w-full flex flex-col items-center justify-center text-on-surface-variant font-body-md">
          <span className="material-symbols-outlined text-4xl text-outline mb-2">
            show_chart
          </span>
          Not enough data to project yet.
          <div className="text-sm text-outline mt-1">
            Log 4+ sessions of a main lift to unlock trend analysis.
          </div>
        </div>
      );
    }

    const points = trendSeries.points;
    const firstDate = new Date(points[0].date).getTime();
    const lastDate = new Date(points[points.length - 1].date).getTime();
    const minE1rm = Math.min(...points.map((p) => p.e1rm));
    const maxE1rm = Math.max(...points.map((p) => p.e1rm));
    const range = maxE1rm - minE1rm || 1;

    // normalize to viewBox 0-400 x, 0-200 y (y inverted)
    const mapX = (date: Date) => {
      const t = date.getTime();
      return ((t - firstDate) / (lastDate - firstDate)) * 400;
    };
    const mapY = (val: number) => {
      return 200 - ((val - minE1rm) / range) * 180 - 10; // leave some margin
    };

    // main path (solid)
    const mainPoints = points.map((p) => {
      const x = mapX(new Date(p.date));
      const y = mapY(p.e1rm);
      return `${x},${y}`;
    });
    const mainPath = mainPoints.join(" ");

    // projection: use last two points to extend
    const lastTwo = points.slice(-2);
    const p1 = lastTwo[0];
    const p2 = lastTwo[1];
    const dx = new Date(p2.date).getTime() - new Date(p1.date).getTime();
    const dy = p2.e1rm - p1.e1rm;
    const slope = dy / dx;
    // extend 30 days beyond last point
    const lastDateObj = new Date(p2.date);
    const projectedDate = new Date(lastDateObj.getTime() + 30 * 24 * 60 * 60 * 1000);
    const projectedVal = p2.e1rm + slope * (30 * 24 * 60 * 60 * 1000);

    const lastX = mapX(lastDateObj);
    const lastY = mapY(p2.e1rm);
    const projX = Math.min(400, mapX(projectedDate));
    const projY = mapY(projectedVal);

    // gradient fill for area under main path
    const areaPoints = mainPoints.map((p) => p).concat(`400,200 0,200`);
    const areaPath = areaPoints.join(" ");

    return (
      <div className="relative h-64 w-full">
        <svg className="overflow-visible" height="100%" preserveAspectRatio="none" viewBox="0 0 400 200" width="100%">
          <defs>
            <linearGradient id="grad1" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* area fill */}
          <path d={`M ${areaPath}`} fill="url(#grad1)" />
          {/* main line */}
          <polyline points={mainPath} fill="none" stroke="#000" strokeWidth="1.5" />
          {/* projection line dashed */}
          <line
            x1={lastX}
            y1={lastY}
            x2={projX}
            y2={projY}
            stroke="#4648d4"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        </svg>
        <div className="flex justify-between w-full mt-2 absolute bottom-0 left-0">
          <span className="font-label-caps text-label-caps text-outline text-[10px]">
            {new Date(points[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <span className="font-label-caps text-label-caps text-outline text-[10px]">
            {new Date(points[points.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <span className="font-label-caps text-label-caps text-secondary text-[10px] flex items-center">
            <div className="w-1 h-1 bg-secondary rounded-full mr-1"></div>
            Proj
          </span>
        </div>
      </div>
    );
  };

  // --- Page render ---
  return (
    <AppLayout>
      <div className="flex flex-col gap-8 animate-fadeIn">
        <header className="flex flex-col gap-2">
          <h1 className="font-metric-display text-headline-lg-mobile md:text-metric-display text-primary tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: "40px" }}>
              psychology
            </span>
            Intelligence Feed
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Evidence-based insights derived from your training data. Deterministic patterns first, AI interpretation on top.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {/* Left feed column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {loading ? (
              // Skeleton cards
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
                <div className="font-body-md text-body-md text-on-surface-variant">
                  {error}
                </div>
                <button
                  onClick={fetchData}
                  className="px-6 py-2 bg-primary text-on-primary rounded-full font-medium hover:bg-primary/80 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : !hasContent ? (
              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center text-center gap-4">
                <span className="material-symbols-outlined text-4xl text-outline">
                  psychology
                </span>
                <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
                  No insights yet.
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                  Log a few workouts — Striv needs at least 4 sessions before it can identify trends.
                </p>
                <a
                  href="/workout"
                  className="px-6 py-2 bg-primary text-on-primary rounded-full font-medium hover:bg-primary/80 transition-colors"
                >
                  Start Workout
                </a>
              </div>
            ) : (
              // Render feed items
              feedItems.map((item, idx) => {
                const isAi = (item as any)._isAi;
                // Remove _isAi before passing
                const { _isAi, ...cleanItem } = item as any;
                return renderCard(cleanItem, isAi, idx);
              })
            )}
          </div>

          {/* Right column: Macro Trend */}
          <div className="lg:col-span-7 flex flex-col gap-gutter hidden lg:flex">
            <div className="bg-surface border border-outline-variant rounded-xl p-8 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="z-10 flex flex-col gap-2">
                <h3 className="font-metric-sm text-metric-sm text-primary text-xl">
                  Macro Trend Analysis
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {trendSeries
                    ? `Overall estimated 1RM trajectory for ${trendSeries.name}.`
                    : "Log 4+ sessions of a main lift to unlock trend analysis."}
                </p>
              </div>
              <div className="mt-8 h-64 w-full relative z-10 border-b border-l border-outline-variant/30 pb-2 pl-2">
                {renderChart()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}