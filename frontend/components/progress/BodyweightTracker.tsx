"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import { apiClient } from "@/lib/api";

export type WeightLogEntry = {
  id: number;
  date: string;
  weight_kg: number;
  notes: string | null;
};

export type WeightHistoryData = {
  logs: WeightLogEntry[];
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  start_weight_kg: number | null;
  change_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  bmi_category: "underweight" | "normal" | "overweight" | "obese" | null;
};

interface BodyweightTrackerProps {
  data: WeightHistoryData | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

const PLOT_W = 600;
const PLOT_H = 220;
const PAD = { top: 20, bottom: 30, left: 10, right: 10 };
const INNER_W = PLOT_W - PAD.left - PAD.right;
const INNER_H = PLOT_H - PAD.top - PAD.bottom;

export default function BodyweightTracker({
  data,
  loading,
  onRefresh,
}: BodyweightTrackerProps) {
  const { t, locale } = useTranslation();
  const { label, convert, toStored, formatWeight } = useUnit();

  // Log modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logWeight, setLogWeight] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active hover point state for chart tooltip
  const [hoveredPoint, setHoveredPoint] = useState<{
    entry: WeightLogEntry;
    x: number;
    y: number;
    displayVal: number;
  } | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const logs = useMemo(() => data?.logs ?? [], [data?.logs]);

  // Current values
  const currentKg = data?.current_weight_kg ?? null;
  const targetKg = data?.target_weight_kg ?? null;
  const startKg = data?.start_weight_kg ?? null;
  const changeKg = data?.change_kg ?? 0;
  const bmi = data?.bmi ?? null;
  const bmiCategory = data?.bmi_category ?? null;

  // Chart calculation
  const chartGeometry = useMemo(() => {
    if (logs.length < 2) return null;

    // Convert values to display unit
    const displayValues = logs.map((l) => convert(l.weight_kg));
    if (targetKg !== null) {
      displayValues.push(convert(targetKg));
    }

    const rawMin = Math.min(...displayValues);
    const rawMax = Math.max(...displayValues);
    const span = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
    const min = Math.max(0, rawMin - span * 0.12);
    const max = rawMax + span * 0.12;
    const yRange = max - min || 1;

    // Sort logs chronologically
    const sorted = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstTime = new Date(sorted[0].date).getTime();
    const lastTime = new Date(sorted[sorted.length - 1].date).getTime();
    const timeSpan = lastTime - firstTime || 1;

    const points = sorted.map((l) => {
      const tTime = new Date(l.date).getTime();
      const xPct = (tTime - firstTime) / timeSpan;
      const x = PAD.left + xPct * INNER_W;
      const displayVal = convert(l.weight_kg);
      const yPct = (displayVal - min) / yRange;
      const y = PAD.top + (1 - yPct) * INNER_H;
      return { x, y, entry: l, displayVal };
    });

    const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`, "");
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(PLOT_H - PAD.bottom).toFixed(1)} L ${points[0].x.toFixed(1)},${(PLOT_H - PAD.bottom).toFixed(1)} Z`;

    // Target reference line Y
    let targetY: number | null = null;
    if (targetKg !== null) {
      const displayTarget = convert(targetKg);
      const targetPct = (displayTarget - min) / yRange;
      targetY = PAD.top + (1 - targetPct) * INNER_H;
    }

    // Ticks
    const tickSteps = 4;
    const ticks: { topPct: number; value: number }[] = [];
    for (let i = 0; i <= tickSteps; i++) {
      const val = min + (yRange / tickSteps) * i;
      const topPct = (1 - (val - min) / yRange) * 100;
      ticks.push({ topPct, value: Math.round(val * 10) / 10 });
    }

    return { points, pathD, areaD, targetY, ticks };
  }, [logs, targetKg, convert]);

  const handleOpenModal = () => {
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogWeight(currentKg !== null ? String(convert(currentKg).toFixed(1)) : "");
    setLogNotes("");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveWeighIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(logWeight);
    if (isNaN(num) || num <= 0) {
      setFormError("Please enter a valid weight number.");
      return;
    }

    const storedKg = toStored(num);
    if (storedKg < 20 || storedKg > 400) {
      setFormError("Weight must be between 20 kg and 400 kg.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await apiClient.post("/profile/weight-history", {
        weight_kg: storedKg,
        date: logDate,
        notes: logNotes.trim() || null,
      });
      setModalOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to record weigh-in. Please try again.";
      setFormError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = useCallback(
    async (id: number) => {
      if (!window.confirm(t("progress.weightDeleteConfirm"))) return;
      setDeletingId(id);
      try {
        await apiClient.delete(`/profile/weight-history/${id}`);
        await onRefresh();
      } catch {
        // Handled silently or refreshed
      } finally {
        setDeletingId(null);
      }
    },
    [onRefresh, t]
  );

  const getBmiBadge = (cat: string | null) => {
    switch (cat) {
      case "normal":
        return { label: t("progress.bmiNormal"), tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" };
      case "underweight":
        return { label: t("progress.bmiUnderweight"), tone: "bg-amber-500/10 text-amber-500 border-amber-500/30" };
      case "overweight":
        return { label: t("progress.bmiOverweight"), tone: "bg-amber-500/10 text-amber-500 border-amber-500/30" };
      case "obese":
        return { label: t("progress.bmiObese"), tone: "bg-error/10 text-error border-error/30" };
      default:
        return null;
    }
  };

  const bmiBadge = getBmiBadge(bmiCategory);

  const goalDeltaKg = currentKg !== null && targetKg !== null ? targetKg - currentKg : null;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Weight */}
        <div className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
              {t("progress.weightCurrent")}
            </span>
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              scale
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            {loading ? (
              <div className="h-9 w-24 bg-surface-container rounded animate-pulse" />
            ) : currentKg !== null ? (
              <>
                <span className="font-metric-display text-metric-display text-primary">
                  {formatWeight(currentKg)}
                </span>
                <span className="font-body-md text-on-surface-variant">{label}</span>
              </>
            ) : (
              <span className="font-metric-sm text-metric-sm text-outline">—</span>
            )}
          </div>
          <p className="mt-1 font-body-md text-xs text-on-surface-variant">
            {startKg !== null && currentKg !== null
              ? `Started: ${formatWeight(startKg)} ${label}`
              : "No initial record"}
          </p>
        </div>

        {/* Target Goal */}
        <div className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
              {t("progress.weightTarget")}
            </span>
            <span className="material-symbols-outlined text-secondary text-[20px]">
              flag
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            {loading ? (
              <div className="h-9 w-24 bg-surface-container rounded animate-pulse" />
            ) : targetKg !== null ? (
              <>
                <span className="font-metric-display text-metric-display text-primary">
                  {formatWeight(targetKg)}
                </span>
                <span className="font-body-md text-on-surface-variant">{label}</span>
              </>
            ) : (
              <span className="font-metric-sm text-metric-sm text-outline">—</span>
            )}
          </div>
          <div className="mt-1">
            {goalDeltaKg !== null ? (
              Math.abs(goalDeltaKg) < 0.2 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  {t("progress.weightGoalReached")}
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant">
                  {t("progress.weightGoalDelta", {
                    val: `${goalDeltaKg > 0 ? "+" : ""}${convert(goalDeltaKg).toFixed(1)} ${label}`,
                  })}
                </span>
              )
            ) : (
              <span className="text-xs text-outline">{t("progress.setInProfile")}</span>
            )}
          </div>
        </div>

        {/* Total Change */}
        <div className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
              {t("progress.weightChange")}
            </span>
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              monitoring
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            {loading ? (
              <div className="h-9 w-24 bg-surface-container rounded animate-pulse" />
            ) : (
              <>
                <span
                  className={`font-metric-display text-metric-display ${
                    changeKg < 0 ? "text-secondary" : changeKg > 0 ? "text-primary" : "text-on-surface"
                  }`}
                >
                  {changeKg > 0 ? "+" : ""}
                  {convert(changeKg).toFixed(1)}
                </span>
                <span className="font-body-md text-on-surface-variant">{label}</span>
              </>
            )}
          </div>
          <p className="mt-1 font-body-md text-xs text-on-surface-variant">
            {logs.length} weigh-in{logs.length === 1 ? "" : "s"} logged
          </p>
        </div>

        {/* BMI & Status */}
        <div className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
              {t("progress.weightBmi")}
            </span>
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
              health_and_safety
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            {loading ? (
              <div className="h-9 w-24 bg-surface-container rounded animate-pulse" />
            ) : bmi !== null ? (
              <>
                <span className="font-metric-display text-metric-display text-primary">
                  {bmi.toFixed(1)}
                </span>
                {bmiBadge && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${bmiBadge.tone}`}
                  >
                    {bmiBadge.label}
                  </span>
                )}
              </>
            ) : (
              <span className="font-metric-sm text-metric-sm text-outline">—</span>
            )}
          </div>
          <p className="mt-1 font-body-md text-xs text-on-surface-variant">
            {data?.height_cm ? `Height: ${data.height_cm} cm` : "Add height in profile for BMI"}
          </p>
        </div>
      </div>

      {/* Hero Chart Card */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 md:p-6 flex flex-col relative overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
              Bodyweight Trajectory
            </h3>
            <p className="font-body-md text-sm text-on-surface-variant mt-0.5">
              Consistent weigh-ins help filter natural water weight fluctuations.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-metric-sm text-metric-sm text-on-primary hover:bg-primary-hover transition-colors shadow-sm self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>{t("progress.weightLogBtn")}</span>
          </button>
        </div>

        {/* Chart Viewbox */}
        <div className="mt-4 h-64 w-full relative">
          {loading ? (
            <div className="h-full w-full bg-surface-container rounded animate-pulse" />
          ) : !chartGeometry ? (
            <div className="h-full w-full flex flex-col items-center justify-center text-on-surface-variant font-body-md border border-dashed border-outline-variant rounded p-6 text-center">
              <span className="material-symbols-outlined text-4xl mb-2 text-outline">
                monitor_weight
              </span>
              <p className="font-metric-sm text-metric-sm text-primary mb-1">
                {t("progress.weightNoHistory")}
              </p>
              <p className="text-xs text-on-surface-variant max-w-sm">
                Log your bodyweight regularly to see your trend line, rate of change, and target trajectory.
              </p>
            </div>
          ) : (
            <>
              {/* HTML Y-axis ticks */}
              <div className="pointer-events-none absolute inset-0">
                {chartGeometry.ticks.map((tick) => (
                  <div
                    key={tick.value}
                    className="absolute left-0 right-0 flex items-center gap-2"
                    style={{ top: `${tick.topPct}%` }}
                  >
                    <span className="w-10 shrink-0 text-right font-label-caps text-[10px] text-outline">
                      {tick.value}
                    </span>
                    <span className="h-px flex-1 bg-outline-variant/30" />
                  </div>
                ))}
              </div>

              <svg
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
              >
                <defs>
                  <linearGradient id="weightAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Shaded Area */}
                <path d={chartGeometry.areaD} fill="url(#weightAreaGrad)" />

                {/* Target line */}
                {chartGeometry.targetY !== null && (
                  <line
                    x1={PAD.left}
                    y1={chartGeometry.targetY}
                    x2={PLOT_W - PAD.right}
                    y2={chartGeometry.targetY}
                    stroke="var(--secondary)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                )}

                {/* Trend line */}
                <path
                  d={chartGeometry.pathD}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Dots */}
                {chartGeometry.points.map((pt) => (
                  <circle
                    key={pt.entry.id}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPoint?.entry.id === pt.entry.id ? 6 : 4}
                    className="cursor-pointer transition-all fill-surface stroke-primary"
                    strokeWidth="2"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}
              </svg>

              {/* Hover Tooltip */}
              {hoveredPoint && (
                <div
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-surface-container-highest px-2.5 py-1.5 shadow-lg border border-outline-variant text-center transition-all z-20"
                  style={{
                    left: `${(hoveredPoint.x / PLOT_W) * 100}%`,
                    top: `${(hoveredPoint.y / PLOT_H) * 100 - 12}%`,
                  }}
                >
                  <p className="font-metric-sm text-metric-sm text-primary font-bold">
                    {hoveredPoint.displayVal.toFixed(1)} {label}
                  </p>
                  <p className="font-label-caps text-[10px] text-on-surface-variant">
                    {hoveredPoint.entry.date}
                  </p>
                  {hoveredPoint.entry.notes && (
                    <p className="text-[11px] text-outline mt-0.5 max-w-[140px] truncate">
                      {hoveredPoint.entry.notes}
                    </p>
                  )}
                </div>
              )}

              {/* Legend & Labels */}
              <div className="absolute bottom-1 right-2 flex items-center gap-4 text-[11px] font-label-caps text-outline bg-surface/80 backdrop-blur-xs px-2 py-0.5 rounded">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-primary rounded" />
                  <span>Actual</span>
                </span>
                {chartGeometry.targetY !== null && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 border-t border-dashed border-secondary" />
                    <span className="text-secondary">{t("progress.weightTargetLine")}</span>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
            {t("progress.weightHistoryTitle")}
          </h3>
          <span className="font-body-md text-xs text-on-surface-variant">
            {logs.length} records
          </span>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-4 text-center">
            {t("progress.weightNoHistory")}
          </p>
        ) : (
          <div className="flex flex-col">
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left font-body-md text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/60 text-outline font-label-caps text-[11px] uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Weight</th>
                    <th className="py-2.5 px-3">Delta</th>
                    <th className="py-2.5 px-3">Notes</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {[...logs]
                    .reverse()
                    .slice(0, 15)
                    .map((log, idx, arr) => {
                      const displayW = convert(log.weight_kg);
                      const nextLog = arr[idx + 1];
                      const delta = nextLog ? displayW - convert(nextLog.weight_kg) : null;
                      return (
                        <tr key={log.id} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-3 font-medium text-primary">
                            {new Date(log.date).toLocaleDateString(locale, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="py-3 px-3 font-semibold text-on-surface">
                            {displayW.toFixed(1)} {label}
                          </td>
                          <td className="py-3 px-3">
                            {delta !== null ? (
                              <span
                                className={`text-xs font-semibold ${
                                  delta < 0
                                    ? "text-secondary"
                                    : delta > 0
                                    ? "text-on-surface-variant"
                                    : "text-outline"
                                }`}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(1)} {label}
                              </span>
                            ) : (
                              <span className="text-outline text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-on-surface-variant text-xs max-w-xs truncate">
                            {log.notes || "—"}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => void handleDeleteEntry(log.id)}
                              disabled={deletingId === log.id}
                              className="text-outline hover:text-error transition-colors p-1 rounded hover:bg-error/10 disabled:opacity-40"
                              title="Delete entry"
                              aria-label="Delete weigh-in entry"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                delete
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Stack (Zero horizontal overflow) */}
            <div className="sm:hidden flex flex-col divide-y divide-outline-variant/40">
              {[...logs]
                .reverse()
                .slice(0, 10)
                .map((log) => {
                  const displayW = convert(log.weight_kg);
                  return (
                    <div key={log.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-primary">
                            {displayW.toFixed(1)} {label}
                          </span>
                          <span className="font-label-caps text-[10px] text-outline">
                            {log.date}
                          </span>
                        </div>
                        {log.notes && (
                          <p className="text-xs text-on-surface-variant truncate mt-0.5">
                            {log.notes}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteEntry(log.id)}
                        disabled={deletingId === log.id}
                        className="text-outline hover:text-error p-1.5 rounded transition-colors disabled:opacity-40 shrink-0"
                        aria-label="Delete weigh-in entry"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Log Modal Dialog */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label={t("progress.weightLogTitle")}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-surface border border-outline-variant p-6 shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/60">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">scale</span>
                <h2 className="font-metric-sm text-metric-sm text-primary font-bold">
                  {t("progress.weightLogTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
                aria-label={t("progress.weightCancelBtn")}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {formError && (
              <p className="text-xs font-semibold text-error bg-error/10 p-2.5 rounded border border-error/20" role="alert">
                {formError}
              </p>
            )}

            <form onSubmit={handleSaveWeighIn} className="flex flex-col gap-4">
              <div>
                <label className="block font-label-caps text-[11px] uppercase text-on-surface-variant mb-1">
                  {t("progress.weightDateLabel")}
                </label>
                <input
                  type="date"
                  required
                  value={logDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-label-caps text-[11px] uppercase text-on-surface-variant mb-1">
                  {t("progress.weightValueLabel")} ({label})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="800"
                    required
                    placeholder={currentKg ? String(convert(currentKg).toFixed(1)) : "75.0"}
                    value={logWeight}
                    onChange={(e) => setLogWeight(e.target.value)}
                    className="w-full rounded-lg bg-surface-container-low border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary pr-12 font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-outline pointer-events-none">
                    {label}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-label-caps text-[11px] uppercase text-on-surface-variant mb-1">
                  {t("progress.weightNotesLabel")}
                </label>
                <input
                  type="text"
                  maxLength={255}
                  placeholder={t("progress.weightNotesPlaceholder")}
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full rounded-lg bg-surface-container-low border border-outline-variant px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5 pt-2 border-t border-outline-variant/40">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  {t("progress.weightCancelBtn")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && (
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>
                  )}
                  <span>{t("progress.weightSaveBtn")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
