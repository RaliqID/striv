"use client";

import { apiClient, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface HeatmapDayRecord {
  date: string; // "YYYY-MM-DD"
  count: number;
  volume: number; // in kg
  level?: number; // 0..4
}

export interface HeatmapApiResponse {
  current_streak?: number;
  current_day_streak?: number;
  best_streak?: number;
  longest_streak?: number;
  total_active_days?: number;
  active_days?: number;
  days?: HeatmapDayRecord[] | Record<string, { count?: number; volume?: number; level?: number }>;
  data?: HeatmapDayRecord[] | Record<string, { count?: number; volume?: number; level?: number }>;
}

interface CellData {
  dateIso: string;
  dateObj: Date;
  count: number;
  volume: number;
  level: number;
  isFuture: boolean;
  isToday: boolean;
}

interface WeekColumn {
  weekIndex: number;
  monthLabel?: string;
  days: CellData[];
}

export default function ActivityHeatmap() {
  const { t, locale } = useTranslation();
  const { label, formatVolume } = useUnit();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiData, setApiData] = useState<HeatmapApiResponse | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    cell: CellData;
    x: number;
    y: number;
  } | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Primary contract: /analytics/heatmap?weeks=52
      const res = await apiClient.get<HeatmapApiResponse>("/analytics/heatmap?weeks=52");
      setApiData(res);
    } catch (err) {
      // Graceful fallback during concurrent development: if /analytics/heatmap is 404,
      // attempt /analytics/progress?days=365 to synthesize activity days
      if (err instanceof ApiError && err.status === 404) {
        try {
          const fallback = await apiClient.get<{
            volume_by_day?: Array<{ date: string; volume: number }>;
          }>("/analytics/progress?days=365");
          if (fallback?.volume_by_day) {
            const mappedDays: HeatmapDayRecord[] = fallback.volume_by_day.map((d) => ({
              date: d.date,
              count: d.volume > 0 ? 1 : 0,
              volume: d.volume,
            }));
            setApiData({ days: mappedDays });
            return;
          }
        } catch {
          // Fall through to error
        }
      }
      setError(err instanceof ApiError ? err.message : t("heatmap.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (mounted) {
      fetchHeatmap();
    }
  }, [mounted, fetchHeatmap]);

  // Auto-scroll to the right (latest week) on mount / data load so mobile users see recent work
  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    }
  }, [loading]);

  // Parse days from apiData into a fast lookup map
  const daysMap = useMemo(() => {
    const map = new Map<string, { count: number; volume: number; level?: number }>();
    if (!apiData) return map;

    const source = apiData.days ?? apiData.data;
    if (Array.isArray(source)) {
      for (const item of source) {
        if (item?.date) {
          map.set(item.date, {
            count: Number(item.count ?? (item.volume > 0 ? 1 : 0)),
            volume: Number(item.volume ?? 0),
            level: item.level != null ? Number(item.level) : undefined,
          });
        }
      }
    } else if (source && typeof source === "object") {
      for (const [date, info] of Object.entries(source)) {
        map.set(date, {
          count: Number(info.count ?? (Number(info.volume ?? 0) > 0 ? 1 : 0)),
          volume: Number(info.volume ?? 0),
          level: info.level != null ? Number(info.level) : undefined,
        });
      }
    }
    return map;
  }, [apiData]);

  // Compute 52-week calendar grid: 52 columns × 7 rows (Mon=0 to Sun=6)
  const { weeks, calculatedMetrics } = useMemo(() => {
    if (!mounted) {
      return {
        weeks: [] as WeekColumn[],
        calculatedMetrics: { currentStreak: 0, bestStreak: 0, totalActiveDays: 0 },
      };
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const todayIso = toIso(now);

    // ISO week: Monday is index 0, Sunday is index 6
    const todayDayOfWeek = (now.getDay() + 6) % 7;
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayDayOfWeek);
    // 52 weeks = 51 weeks before currentMonday + current week
    const startMonday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 51 * 7);

    // Determine volume thresholds for dynamic intensity levels (1..4)
    const activeVolumes: number[] = [];
    daysMap.forEach((val) => {
      if (val.volume > 0) activeVolumes.push(val.volume);
    });
    activeVolumes.sort((a, b) => a - b);
    const p25 = activeVolumes[Math.floor(activeVolumes.length * 0.25)] || 500;
    const p50 = activeVolumes[Math.floor(activeVolumes.length * 0.5)] || 1500;
    const p75 = activeVolumes[Math.floor(activeVolumes.length * 0.75)] || 3000;

    const weeksList: WeekColumn[] = [];
    let lastLabeledMonth = -1;

    let activeDaysCount = 0;
    let runningStreak = 0;
    let maxStreak = 0;

    // Track chronological days for streak calculation
    const chronologicalCells: CellData[] = [];

    for (let w = 0; w < 52; w++) {
      const daysInWeek: CellData[] = [];
      let weekMonthLabel: string | undefined;

      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startMonday.getFullYear(), startMonday.getMonth(), startMonday.getDate() + (w * 7 + d));
        const cellIso = toIso(cellDate);
        const isFuture = cellIso > todayIso;
        const isToday = cellIso === todayIso;

        const record = daysMap.get(cellIso);
        const count = isFuture ? 0 : (record?.count ?? 0);
        const volume = isFuture ? 0 : (record?.volume ?? 0);

        let level = 0;
        if (!isFuture && (count > 0 || volume > 0)) {
          if (record?.level != null) {
            level = Math.max(1, Math.min(4, record.level));
          } else {
            if (volume <= p25) level = 1;
            else if (volume <= p50) level = 2;
            else if (volume <= p75) level = 3;
            else level = 4;
          }
        }

        const cell: CellData = {
          dateIso: cellIso,
          dateObj: cellDate,
          count,
          volume,
          level,
          isFuture,
          isToday,
        };

        daysInWeek.push(cell);
        if (!isFuture) {
          chronologicalCells.push(cell);
        }
      }

      // Check Wednesday of this week for month label placement
      const midWeekDate = daysInWeek[2].dateObj;
      const monthIdx = midWeekDate.getMonth();
      if (monthIdx !== lastLabeledMonth && w >= 1 && w <= 50) {
        weekMonthLabel = midWeekDate.toLocaleDateString(locale, { month: "short" });
        lastLabeledMonth = monthIdx;
      }

      weeksList.push({
        weekIndex: w,
        monthLabel: weekMonthLabel,
        days: daysInWeek,
      });
    }

    // Compute streaks across chronological days
    for (let i = 0; i < chronologicalCells.length; i++) {
      const c = chronologicalCells[i];
      if (c.count > 0 || c.volume > 0) {
        activeDaysCount++;
        runningStreak++;
        if (runningStreak > maxStreak) {
          maxStreak = runningStreak;
        }
      } else {
        runningStreak = 0;
      }
    }

    // Calculate current streak backwards from today (or yesterday if today is not yet logged)
    let currentStreak = 0;
    const rev = [...chronologicalCells].reverse();
    if (rev.length > 0) {
      const todayCell = rev[0];
      let startIndex = 0;

      if (todayCell.count > 0 || todayCell.volume > 0) {
        startIndex = 0;
      } else if (rev.length > 1 && (rev[1].count > 0 || rev[1].volume > 0)) {
        // Today is not logged yet, but yesterday was active
        startIndex = 1;
      } else {
        startIndex = -1; // Streak broken
      }

      if (startIndex >= 0) {
        for (let i = startIndex; i < rev.length; i++) {
          if (rev[i].count > 0 || rev[i].volume > 0) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return {
      weeks: weeksList,
      calculatedMetrics: {
        currentStreak,
        bestStreak: maxStreak,
        totalActiveDays: activeDaysCount,
      },
    };
  }, [mounted, daysMap, locale]);

  // Streaks: prefer API values if supplied, otherwise use calculated fallback
  const currentStreak = apiData?.current_streak ?? apiData?.current_day_streak ?? calculatedMetrics.currentStreak;
  const bestStreak = apiData?.best_streak ?? apiData?.longest_streak ?? calculatedMetrics.bestStreak;
  const totalActiveDays = apiData?.total_active_days ?? apiData?.active_days ?? calculatedMetrics.totalActiveDays;

  // Level color palette matching design system specifications
  const getLevelClasses = (level: number, isFuture: boolean, isToday: boolean) => {
    if (isFuture) {
      return "bg-transparent border border-dashed border-outline-variant/30 cursor-default opacity-40";
    }
    const todayRing = isToday ? "ring-1 ring-primary ring-offset-1" : "";
    switch (level) {
      case 1:
        return `bg-secondary/30 hover:bg-secondary/40 ${todayRing}`;
      case 2:
        return `bg-secondary/60 hover:bg-secondary/70 ${todayRing}`;
      case 3:
        return `bg-secondary hover:bg-secondary/90 ${todayRing}`;
      case 4:
        return `bg-secondary-container hover:bg-secondary-container/90 shadow-xs shadow-secondary-container/50 ${todayRing}`;
      case 0:
      default:
        return `bg-surface-container-high hover:bg-surface-variant ${todayRing}`;
    }
  };

  const dayOfWeekLabels = [
    t("dashboard.dayMon") !== "dashboard.dayMon" ? t("dashboard.dayMon") : "Mon",
    "",
    t("dashboard.dayWed") !== "dashboard.dayWed" ? t("dashboard.dayWed") : "Wed",
    "",
    t("dashboard.dayFri") !== "dashboard.dayFri" ? t("dashboard.dayFri") : "Fri",
    "",
    "",
  ];

  const formatCellDate = (d: Date) => {
    return d.toLocaleDateString(locale, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleCellHover = (cell: CellData, event: React.MouseEvent<HTMLButtonElement>) => {
    if (cell.isFuture) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredCell({
      cell,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  return (
    <section className="minimal-card rounded-xl p-5 md:p-6 border border-border bg-surface-container-lowest">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <h3 className="font-metric-sm text-metric-sm text-primary">
              {t("heatmap.title")}
            </h3>
          </div>
          <p className="font-body-md text-xs text-on-surface-variant mt-1">
            {t("heatmap.subtitle")}
          </p>
        </div>

        {/* Metric Badges Banner */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Current Streak */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-border">
            <span
              className="material-symbols-outlined text-[#F97316] text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                {t("heatmap.currentStreak")}
              </span>
              <span className="font-metric-sm text-metric-sm text-primary font-bold">
                {loading ? "—" : `${currentStreak} ${t("heatmap.dayUnit")}`}
              </span>
            </div>
          </div>

          {/* Best Streak */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-border">
            <span
              className="material-symbols-outlined text-secondary text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              military_tech
            </span>
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                {t("heatmap.bestStreak")}
              </span>
              <span className="font-metric-sm text-metric-sm text-primary font-bold">
                {loading ? "—" : `${bestStreak} ${t("heatmap.dayUnit")}`}
              </span>
            </div>
          </div>

          {/* Total Active Days */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low border border-border">
            <span className="material-symbols-outlined text-primary text-[20px]">
              calendar_month
            </span>
            <div className="flex flex-col">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                {t("heatmap.activeDays")}
              </span>
              <span className="font-metric-sm text-metric-sm text-primary font-bold">
                {loading ? "—" : `${totalActiveDays} ${t("heatmap.dayUnit")}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: 4 States (Loading, Error, Empty, Success) */}
      {!mounted || loading ? (
        // Loading State: Shimmering skeleton grid
        <div className="space-y-4">
          <div className="animate-pulse h-32 bg-surface-container rounded-lg w-full" />
          <div className="flex justify-between items-center text-xs text-on-surface-variant">
            <div className="h-3 w-28 bg-surface-container rounded animate-pulse" />
            <div className="h-3 w-36 bg-surface-container rounded animate-pulse" />
          </div>
        </div>
      ) : error ? (
        // Error State with Retry CTA
        <div className="flex flex-col items-center justify-center p-8 text-center bg-surface-container-low rounded-xl border border-border">
          <span className="material-symbols-outlined text-error text-[36px] mb-2">
            error_outline
          </span>
          <p className="font-body-md text-sm text-error mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchHeatmap}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-hover font-metric-sm text-metric-sm transition-colors"
          >
            {t("heatmap.retry")}
          </button>
        </div>
      ) : totalActiveDays === 0 ? (
        // Empty State: Member hasn't logged any workouts yet
        <div className="flex flex-col items-center justify-center p-8 text-center bg-surface-container-low rounded-xl border border-dashed border-outline-variant">
          <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-secondary text-[24px]">
              fitness_center
            </span>
          </div>
          <h4 className="font-metric-sm text-metric-sm text-primary mb-1">
            {t("heatmap.emptyTitle")}
          </h4>
          <p className="font-body-md text-xs text-on-surface-variant max-w-sm mb-4">
            {t("heatmap.emptyDesc")}
          </p>
          <Link
            href="/workout"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-hover font-metric-sm text-metric-sm transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>{t("heatmap.startWorkout")}</span>
          </Link>
        </div>
      ) : (
        // Success State: 52-Week Grid
        <div className="relative">
          {/* Scrollable Container with responsive horizontal scroll on mobile */}
          <div
            ref={scrollContainerRef}
            className="w-full overflow-x-auto pb-2 scrollbar-thin focus:outline-none"
            tabIndex={0}
            aria-label="52-Week Workout Heatmap Grid"
          >
            <div className="w-max min-w-full">
              {/* Month Labels Header */}
              <div className="flex items-center mb-1.5 pl-8">
                {weeks.map((w, i) => (
                  <div
                    key={i}
                    className="w-3 md:w-3.5 mr-1 text-[10px] font-medium text-on-surface-variant overflow-visible whitespace-nowrap"
                  >
                    {w.monthLabel ? (
                      <span className="inline-block transform -translate-x-1">
                        {w.monthLabel}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Grid: Day Labels + 52 Week Columns */}
              <div className="flex items-start">
                {/* Left Day of Week Labels (Mon, Wed, Fri) */}
                <div className="flex flex-col gap-1 mr-2 text-[10px] font-medium text-on-surface-variant select-none w-6 text-right">
                  {dayOfWeekLabels.map((lbl, idx) => (
                    <div
                      key={idx}
                      className="h-3 md:h-3.5 flex items-center justify-end leading-none"
                    >
                      {lbl}
                    </div>
                  ))}
                </div>

                {/* 52 Columns */}
                <div className="flex gap-1">
                  {weeks.map((week) => (
                    <div key={week.weekIndex} className="flex flex-col gap-1">
                      {week.days.map((cell) => {
                        const cellColor = getLevelClasses(cell.level, cell.isFuture, cell.isToday);
                        const isHovered = hoveredCell?.cell.dateIso === cell.dateIso;
                        const isSelected = selectedCell?.dateIso === cell.dateIso;

                        return (
                          <button
                            key={cell.dateIso}
                            type="button"
                            disabled={cell.isFuture}
                            aria-label={`${formatCellDate(cell.dateObj)}: ${
                              cell.count > 0
                                ? `${cell.count} workouts, ${formatVolume(cell.volume)} ${label}`
                                : t("heatmap.noActivity")
                            }`}
                            onMouseEnter={(e) => handleCellHover(cell, e)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => setSelectedCell(cell)}
                            className={`w-3 h-3 md:w-3.5 md:h-3.5 rounded-[2px] transition-all relative outline-none ${cellColor} ${
                              isHovered || isSelected ? "ring-2 ring-primary z-20 scale-125" : ""
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Floating Hover Tooltip */}
          {hoveredCell && (
            <div
              className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 px-3 py-2 rounded-lg bg-surface-container-lowest border border-border shadow-xl text-left"
              style={{
                left: `${hoveredCell.x}px`,
                top: `${hoveredCell.y - 8}px`,
              }}
            >
              <p className="font-metric-sm text-xs text-primary font-semibold">
                {formatCellDate(hoveredCell.cell.dateObj)}
              </p>
              <div className="flex items-center gap-2 mt-1 font-body-md text-xs text-on-surface-variant">
                <span>
                  {hoveredCell.cell.count > 0
                    ? t(hoveredCell.cell.count === 1 ? "heatmap.sessionSingle" : "heatmap.sessions", {
                        count: hoveredCell.cell.count,
                      })
                    : t("heatmap.noActivity")}
                </span>
                {hoveredCell.cell.volume > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-outline-variant" />
                    <span className="font-semibold text-primary">
                      {formatVolume(hoveredCell.cell.volume)} {label}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Selected Cell Inspector Banner (Mobile-Friendly Tap State) */}
          {selectedCell && (
            <div className="mt-4 p-3 rounded-lg bg-surface-container-low border border-border flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">
                  event
                </span>
                <span className="font-semibold text-primary">
                  {formatCellDate(selectedCell.dateObj)}
                </span>
                <span className="text-on-surface-variant">
                  {selectedCell.count > 0
                    ? t(selectedCell.count === 1 ? "heatmap.sessionSingle" : "heatmap.sessions", {
                        count: selectedCell.count,
                      })
                    : t("heatmap.noActivity")}
                </span>
                {selectedCell.volume > 0 && (
                  <span className="font-semibold text-primary">
                    ({formatVolume(selectedCell.volume)} {label})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="text-on-surface-variant hover:text-primary transition-colors text-xs"
              >
                {t("action.close") !== "action.close" ? t("action.close") : "Close"}
              </button>
            </div>
          )}

          {/* Legend Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border flex-wrap gap-2 text-xs text-on-surface-variant">
            <span className="font-body-md text-[11px]">
              {totalActiveDays} {t("heatmap.dayUnit")} {t("heatmap.subtitle").toLowerCase()}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium">{t("heatmap.less")}</span>
              <div className="w-2.5 h-2.5 rounded-[2px] bg-surface-container-high" title="Level 0" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary/30" title="Level 1" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary/60" title="Level 2" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary" title="Level 3" />
              <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary-container" title="Level 4" />
              <span className="text-[11px] font-medium">{t("heatmap.more")}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
