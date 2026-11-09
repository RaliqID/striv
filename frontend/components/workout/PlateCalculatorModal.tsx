"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import { type Unit } from "@/lib/units";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export interface PlateCalculatorModalProps {
  open: boolean;
  onClose: () => void;
  initialWeight?: number | null;
  initialUnit?: Unit;
  onApplyWeight?: (weight: number) => void;
  exerciseName?: string;
  setIndex?: number;
}

interface PlateSpec {
  weight: number;
  label: string;
  color: string; // hex
  textColor: string;
  borderColor?: string;
  height: number; // visual height in svg px (max ~130)
  thickness: number; // visual thickness in svg px
}

const KG_PLATES: PlateSpec[] = [
  { weight: 25, label: "25", color: "#EF4444", textColor: "#FFFFFF", height: 130, thickness: 22 },
  { weight: 20, label: "20", color: "#3B82F6", textColor: "#FFFFFF", height: 130, thickness: 19 },
  { weight: 15, label: "15", color: "#EAB308", textColor: "#1C1B1B", height: 114, thickness: 17 },
  { weight: 10, label: "10", color: "#22C55E", textColor: "#FFFFFF", height: 98, thickness: 15 },
  { weight: 5, label: "5", color: "#F3F4F6", textColor: "#1C1B1B", borderColor: "#9CA3AF", height: 80, thickness: 13 },
  { weight: 2.5, label: "2.5", color: "#374151", textColor: "#FFFFFF", height: 66, thickness: 11 },
  { weight: 1.25, label: "1.25", color: "#9CA3AF", textColor: "#1C1B1B", height: 52, thickness: 9 },
];

const LBS_PLATES: PlateSpec[] = [
  { weight: 55, label: "55", color: "#EF4444", textColor: "#FFFFFF", height: 130, thickness: 22 },
  { weight: 45, label: "45", color: "#3B82F6", textColor: "#FFFFFF", height: 130, thickness: 19 },
  { weight: 35, label: "35", color: "#EAB308", textColor: "#1C1B1B", height: 114, thickness: 17 },
  { weight: 25, label: "25", color: "#22C55E", textColor: "#FFFFFF", height: 98, thickness: 15 },
  { weight: 10, label: "10", color: "#F3F4F6", textColor: "#1C1B1B", borderColor: "#9CA3AF", height: 80, thickness: 13 },
  { weight: 5, label: "5", color: "#374151", textColor: "#FFFFFF", height: 66, thickness: 11 },
  { weight: 2.5, label: "2.5", color: "#9CA3AF", textColor: "#1C1B1B", height: 52, thickness: 9 },
];

interface BarbellTypeOption {
  id: "mens_20" | "womens_15" | "ez_10" | "smith_0";
  labelKey: string;
  defaultLabel: string;
  weightKg: number;
  weightLbs: number;
}

const BARBELL_OPTIONS: BarbellTypeOption[] = [
  { id: "mens_20", labelKey: "plates.mensBar", defaultLabel: "Olympic Men (20 kg / 45 lb)", weightKg: 20, weightLbs: 45 },
  { id: "womens_15", labelKey: "plates.womensBar", defaultLabel: "Olympic Women (15 kg / 35 lb)", weightKg: 15, weightLbs: 35 },
  { id: "ez_10", labelKey: "plates.ezBar", defaultLabel: "EZ / Tech Bar (10 kg / 25 lb)", weightKg: 10, weightLbs: 25 },
  { id: "smith_0", labelKey: "plates.smithBar", defaultLabel: "Smith / Custom (0 kg / 0 lb)", weightKg: 0, weightLbs: 0 },
];

export default function PlateCalculatorModal({
  open,
  onClose,
  initialWeight,
  initialUnit,
  onApplyWeight,
  exerciseName,
  setIndex,
}: PlateCalculatorModalProps) {
  const { t } = useTranslation();
  const { unit: currentAppUnit, ready } = useUnit();
  const modalTitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const activeUnit = initialUnit ?? currentAppUnit;

  // Selected barbell type
  const [selectedBarId, setSelectedBarId] = useState<BarbellTypeOption["id"]>("mens_20");

  const selectedBar = useMemo(
    () => BARBELL_OPTIONS.find((b) => b.id === selectedBarId) ?? BARBELL_OPTIONS[0],
    [selectedBarId]
  );

  const barWeight = activeUnit === "lbs" ? selectedBar.weightLbs : selectedBar.weightKg;

  // Target weight state
  const [weightInput, setWeightInput] = useState<string>(() => {
    if (initialWeight != null && initialWeight > 0) {
      return String(initialWeight);
    }
    return String(activeUnit === "lbs" ? 135 : 60);
  });

  // Sync when initialWeight changes or modal opens
  useEffect(() => {
    if (open) {
      if (initialWeight != null && initialWeight > 0) {
        setWeightInput(String(initialWeight));
      } else {
        setWeightInput(String(activeUnit === "lbs" ? 135 : 60));
      }
    }
  }, [open, initialWeight, activeUnit]);

  // Keyboard navigation & accessibility
  useEffect(() => {
    if (!open) return;

    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const targetWeightNum = useMemo(() => {
    const val = parseFloat(weightInput);
    return Number.isFinite(val) && val >= 0 ? val : 0;
  }, [weightInput]);

  // Calculate plate distribution per sleeve
  const { weightPerSide, sidePlates, unallocatedPerSide, totalPlatesWeight } = useMemo(() => {
    const needed = Math.max(0, targetWeightNum - barWeight);
    const perSide = needed / 2;
    const plateCatalog = activeUnit === "lbs" ? LBS_PLATES : KG_PLATES;

    let remaining = perSide;
    const platesUsed: { plate: PlateSpec; count: number }[] = [];

    for (const plate of plateCatalog) {
      if (remaining < 0.001) break;
      const count = Math.floor((remaining + 0.0001) / plate.weight);
      if (count > 0) {
        platesUsed.push({ plate, count });
        remaining -= count * plate.weight;
        remaining = Math.round(remaining * 1000) / 1000;
      }
    }

    const unallocated = remaining > 0.01 ? remaining : 0;
    const loadedPlatesWeight = (perSide - unallocated) * 2;

    return {
      weightPerSide: perSide,
      sidePlates: platesUsed,
      unallocatedPerSide: unallocated,
      totalPlatesWeight: loadedPlatesWeight,
    };
  }, [targetWeightNum, barWeight, activeUnit]);

  // Flattened plates list for visual sleeve render (from inner collar stop outward)
  const flattenedPlatesForRender = useMemo(() => {
    const list: PlateSpec[] = [];
    for (const item of sidePlates) {
      for (let i = 0; i < item.count; i++) {
        list.push(item.plate);
      }
    }
    return list;
  }, [sidePlates]);

  const handleAdjustWeight = useCallback((delta: number) => {
    setWeightInput((prev) => {
      const cur = parseFloat(prev);
      const base = Number.isFinite(cur) ? cur : 0;
      const next = Math.max(0, Math.round((base + delta) * 100) / 100);
      return String(next);
    });
  }, []);

  const handleApply = () => {
    if (onApplyWeight && targetWeightNum > 0) {
      onApplyWeight(targetWeightNum);
    }
    onClose();
  };

  if (!open) return null;

  // Quick increment buttons according to unit
  const quickDeltas =
    activeUnit === "lbs"
      ? [-20, -10, -5, 5, 10, 20]
      : [-10, -5, -2.5, 2.5, 5, 10];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-surface-container-lowest p-5 sm:p-6 shadow-2xl outline-none my-auto max-h-[92vh] flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                calculate
              </span>
              <h3 id={modalTitleId} className="font-metric-sm text-base text-primary font-bold">
                {t("plates.title")}
              </h3>
            </div>
            <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
              {exerciseName
                ? `${exerciseName}${setIndex != null ? ` · Set ${setIndex + 1}` : ""}`
                : t("plates.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("plates.close")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Inputs Section */}
        {!ready ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined animate-spin text-secondary text-[28px]">
              progress_activity
            </span>
            <span className="font-body-md text-xs text-on-surface-variant">Loading plate data…</span>
          </div>
        ) : (
          <>
          <div className="space-y-4 py-4">
          {/* Target Weight Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="target-weight-input" className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                {t("plates.targetWeight")} ({activeUnit})
              </label>
              <span className="font-metric-sm text-xs text-secondary font-semibold">
                {t("plates.weightPerSide")}: {weightPerSide.toFixed(2)} {activeUnit}
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                id="target-weight-input"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full h-12 bg-surface px-4 pr-14 font-headline-lg-mobile text-headline-lg-mobile text-primary border border-outline-variant rounded-xl focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                placeholder="0"
              />
              <span className="absolute right-4 font-metric-sm text-sm text-on-surface-variant font-bold">
                {activeUnit}
              </span>
            </div>

            {/* Quick Adjust Delta Pills */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {quickDeltas.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => handleAdjustWeight(delta)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-surface-container hover:bg-surface-variant text-on-surface transition-colors"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>

          {/* Barbell Type Selection */}
          <div>
            <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold block mb-2">
              {t("plates.barbellType")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BARBELL_OPTIONS.map((opt) => {
                const isSelected = selectedBarId === opt.id;
                const optWeight = activeUnit === "lbs" ? opt.weightLbs : opt.weightKg;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedBarId(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary text-on-primary shadow-xs"
                        : "border-border bg-surface-container-low hover:bg-surface-container text-on-surface"
                    }`}
                  >
                    <div className="font-metric-sm text-xs font-bold leading-tight">
                      {t(opt.labelKey) !== opt.labelKey ? t(opt.labelKey) : opt.defaultLabel}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${isSelected ? "text-on-primary/80" : "text-on-surface-variant"}`}>
                      {optWeight} {activeUnit}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visual Barbell Sleeve Simulation (SVG 2D) */}
        <div className="bg-surface-container-low border border-border rounded-xl p-3 sm:p-4 my-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              Sleeve Visualization (1 Side)
            </span>
            <span className="font-label-caps text-[11px] text-on-surface-variant">
              {flattenedPlatesForRender.length} {flattenedPlatesForRender.length === 1 ? "plate" : "plates"} loaded
            </span>
          </div>

          {/* SVG Sleeve Viewport */}
          <div className="w-full overflow-x-auto py-2 flex items-center justify-center">
            <svg
              viewBox="0 0 380 150"
              className="w-full h-auto max-h-[140px] select-none"
              preserveAspectRatio="xMidYMid meet"
              aria-label="Barbell Sleeve Plate Diagram"
            >
              <defs>
                {/* Metallic Shaft Knurling Pattern */}
                <pattern id="knurl-pattern" width="4" height="4" patternUnits="userSpaceOnUse">
                  <path d="M0 4L4 0M0 0L4 4" stroke="#64748B" strokeWidth="0.5" />
                </pattern>
                {/* Steel Sleeve Gradient */}
                <linearGradient id="steel-sleeve" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#CBD5E1" />
                  <stop offset="50%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#64748B" />
                </linearGradient>
                {/* Collar Stop Ring Gradient */}
                <linearGradient id="collar-ring" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="50%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
              </defs>

              {/* Barbell Inner Shaft (Left) */}
              <rect x="0" y="65" width="55" height="20" fill="url(#knurl-pattern)" rx="2" />
              <rect x="0" y="65" width="55" height="20" fill="none" stroke="#475569" strokeWidth="1" />

              {/* Inner Collar Stop Ring */}
              <rect x="55" y="45" width="14" height="60" fill="url(#collar-ring)" rx="3" stroke="#0F172A" strokeWidth="1" />

              {/* Barbell Sleeve (Center to Right) */}
              <rect x="69" y="68" width="300" height="14" fill="url(#steel-sleeve)" rx="2" stroke="#475569" strokeWidth="1" />

              {/* Stacked Plates on Sleeve */}
              {flattenedPlatesForRender.length === 0 ? (
                // Empty state text directly on the sleeve
                <text
                  x="180"
                  y="79"
                  textAnchor="middle"
                  fill="#747878"
                  fontSize="11"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="500"
                >
                  {t("plates.emptyBar")}
                </text>
              ) : (
                (() => {
                  let currentX = 72; // Start immediately adjacent to collar
                  const plateElements: React.ReactNode[] = [];

                  flattenedPlatesForRender.forEach((plate, idx) => {
                    const plateHeight = plate.height;
                    const plateWidth = Math.max(10, plate.thickness);
                    const plateY = (150 - plateHeight) / 2;

                    plateElements.push(
                      <g key={`${plate.weight}-${idx}`}>
                        {/* Plate Body */}
                        <rect
                          x={currentX}
                          y={plateY}
                          width={plateWidth}
                          height={plateHeight}
                          rx={3}
                          fill={plate.color}
                          stroke={plate.borderColor ?? "rgba(0,0,0,0.35)"}
                          strokeWidth="1"
                        />
                        {/* Inner Chamfer Rim Accent */}
                        <rect
                          x={currentX + 2}
                          y={plateY + 4}
                          width={Math.max(2, plateWidth - 4)}
                          height={plateHeight - 8}
                          rx={2}
                          fill="none"
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth="0.8"
                        />
                        {/* Weight Label */}
                        <text
                          x={currentX + plateWidth / 2}
                          y={79}
                          textAnchor="middle"
                          fill={plate.textColor}
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="system-ui, sans-serif"
                          dominantBaseline="central"
                          transform={`rotate(-90 ${currentX + plateWidth / 2} 75)`}
                        >
                          {plate.label}
                        </text>
                      </g>
                    );
                    currentX += plateWidth + 2;
                  });

                  // Lock Jaw Clamp Collar at the end of plate stack
                  plateElements.push(
                    <g key="collar-clamp">
                      <rect
                        x={currentX + 2}
                        y="55"
                        width="10"
                        height="40"
                        rx="2"
                        fill="#0F172A"
                        stroke="#334155"
                        strokeWidth="1"
                      />
                      {/* Red Quick Release Lever on Clamp */}
                      <rect
                        x={currentX + 4}
                        y="48"
                        width="4"
                        height="10"
                        rx="1"
                        fill="#EF4444"
                      />
                    </g>
                  );

                  return plateElements;
                })()
              )}

              {/* End Cap of Barbell Sleeve */}
              <circle cx="367" cy="75" r="7" fill="#64748B" stroke="#334155" strokeWidth="1" />
              <circle cx="367" cy="75" r="2.5" fill="#334155" />
            </svg>
          </div>

          {/* Unallocated Remainder Warning State */}
          {unallocatedPerSide > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-error-container text-on-error-container text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span>
                +{(unallocatedPerSide * 2).toFixed(2)} {activeUnit} {t("plates.unallocated")} (
                {unallocatedPerSide.toFixed(2)} {activeUnit} / side)
              </span>
            </div>
          )}
        </div>

        {/* Plates List Breakdown Badges */}
        <div className="pt-2">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold block mb-2">
            {t("plates.perSideTitle")}
          </span>

          {sidePlates.length === 0 ? (
            <p className="font-body-md text-xs text-on-surface-variant py-2">
              {t("plates.emptyBar")}
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {sidePlates.map(({ plate, count }) => (
                <div
                  key={plate.weight}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-container text-xs font-semibold text-primary"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-black/20"
                    style={{ backgroundColor: plate.color }}
                  />
                  <span>
                    {plate.weight} {activeUnit} × {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total Summary Footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-on-surface-variant">
          <span>
            {t("plates.barWeight")}: <strong className="text-primary">{barWeight} {activeUnit}</strong>
          </span>
          <span>
            {t("plates.platesTotal")}: <strong className="text-primary">{totalPlatesWeight.toFixed(2)} {activeUnit}</strong>
          </span>
          <span>
            Total: <strong className="text-secondary font-bold text-sm">{(barWeight + totalPlatesWeight).toFixed(2)} {activeUnit}</strong>
          </span>
        </div>
        </>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-outline-variant bg-surface hover:bg-surface-container font-metric-sm text-metric-sm text-on-surface transition-colors"
          >
            {t("plates.close")}
          </button>

          {onApplyWeight && (
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover font-metric-sm text-metric-sm text-on-primary transition-colors shadow-sm"
            >
              {t("plates.applyToSet")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
