"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { type Unit } from "@/lib/units";
import { useEffect, useId, useMemo, useRef } from "react";

export interface OneRmEstimatorPopoverProps {
  open: boolean;
  onClose: () => void;
  weight: number;
  reps: number;
  unit: Unit;
  exerciseName?: string;
  setIndex?: number;
}

interface TrainingZone {
  pct: number;
  labelKey: string;
  defaultLabel: string;
  repRange: string;
  adaptationKey: string;
  defaultAdaptation: string;
  minReps: number;
  maxReps: number;
}

const TRAINING_ZONES: TrainingZone[] = [
  {
    pct: 0.95,
    labelKey: "onerm.peakStrength",
    defaultLabel: "Peak Strength",
    repRange: "1–2 reps",
    adaptationKey: "onerm.peakStrengthDesc",
    defaultAdaptation: "Neuromuscular efficiency & maximum force output",
    minReps: 1,
    maxReps: 2,
  },
  {
    pct: 0.85,
    labelKey: "onerm.strengthPower",
    defaultLabel: "Strength & Power",
    repRange: "5–6 reps",
    adaptationKey: "onerm.strengthPowerDesc",
    defaultAdaptation: "Heavy compound strength & myofibrillar hypertrophy",
    minReps: 3,
    maxReps: 6,
  },
  {
    pct: 0.75,
    labelKey: "onerm.hypertrophy",
    defaultLabel: "Hypertrophy",
    repRange: "8–10 reps",
    adaptationKey: "onerm.hypertrophyDesc",
    defaultAdaptation: "Mechanical tension & sarcoplasmic muscle growth",
    minReps: 7,
    maxReps: 11,
  },
  {
    pct: 0.65,
    labelKey: "onerm.endurance",
    defaultLabel: "Muscular Endurance",
    repRange: "12–15 reps",
    adaptationKey: "onerm.enduranceDesc",
    defaultAdaptation: "Metabolic conditioning & lactate threshold capacity",
    minReps: 12,
    maxReps: 20,
  },
];

export default function OneRmEstimatorPopover({
  open,
  onClose,
  weight,
  reps,
  unit,
  exerciseName,
  setIndex,
}: OneRmEstimatorPopoverProps) {
  const { t } = useTranslation();
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Compute 1RM estimations via Epley & Brzycki formulas
  const { epley, brzycki, average1rm, isValidSubmax } = useMemo(() => {
    if (weight <= 0 || reps <= 0) {
      return { epley: 0, brzycki: 0, average1rm: 0, isValidSubmax: false };
    }

    if (reps === 1) {
      return { epley: weight, brzycki: weight, average1rm: weight, isValidSubmax: true };
    }

    // Formulas are valid for reps 1..15 (above 37, Brzycki denominator becomes <= 0)
    const valid = reps <= 15;
    const boundedReps = Math.min(reps, 36);

    // Epley: weight * (1 + reps / 30)
    const e = weight * (1 + boundedReps / 30);

    // Brzycki: weight * (36 / (37 - reps))
    const b = weight * (36 / (37 - boundedReps));

    const avg = (e + b) / 2;

    return {
      epley: Math.round(e * 10) / 10,
      brzycki: Math.round(b * 10) / 10,
      average1rm: Math.round(avg * 10) / 10,
      isValidSubmax: valid,
    };
  }, [weight, reps]);

  if (!open) return null;

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
        aria-labelledby={dialogId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-surface-container-lowest p-5 sm:p-6 shadow-2xl outline-none my-auto max-h-[92vh] flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                trending_up
              </span>
              <h3 id={dialogId} className="font-metric-sm text-base text-primary font-bold">
                {t("onerm.title")}
              </h3>
            </div>
            <p className="font-body-md text-xs text-on-surface-variant mt-0.5">
              {exerciseName
                ? `${exerciseName}${setIndex != null ? ` · Set ${setIndex + 1}` : ""}`
                : t("onerm.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("onerm.close")}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Current Set Input Banner */}
        <div className="py-3 px-4 my-3 rounded-xl bg-surface-container-low border border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
              Input Set:
            </span>
            <span className="font-metric-sm text-sm text-primary font-bold">
              {weight} {unit} × {reps} {reps === 1 ? "rep" : "reps"}
            </span>
          </div>

          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary/10 text-secondary">
            {reps === 1 ? t("onerm.actual1rm") : "Submaximal Estimate"}
          </span>
        </div>

        {/* 1RM Highlight Card */}
        <div className="p-4 rounded-xl bg-surface-container border border-border my-2">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider block mb-1">
            {t("onerm.avgEstimate")}
          </span>

          <div className="flex items-baseline gap-3">
            <span className="font-metric-display text-[38px] leading-tight text-primary font-extrabold">
              {average1rm}
            </span>
            <span className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface-variant font-bold">
              {unit}
            </span>
          </div>

          {/* Formulas Comparison Grid */}
          {reps > 1 && (
            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-outline-variant/60 text-xs">
              <div className="space-y-0.5">
                <span className="text-on-surface-variant font-medium block">
                  {t("onerm.epley")}
                </span>
                <span className="font-metric-sm text-sm text-primary font-bold">
                  {epley} {unit}
                </span>
                <span className="text-[10px] text-on-surface-variant block font-mono">
                  {weight} × (1 + {reps}/30)
                </span>
              </div>

              <div className="space-y-0.5">
                <span className="text-on-surface-variant font-medium block">
                  {t("onerm.brzycki")}
                </span>
                <span className="font-metric-sm text-sm text-primary font-bold">
                  {brzycki} {unit}
                </span>
                <span className="text-[10px] text-on-surface-variant block font-mono">
                  {weight} × (36 / {37 - reps})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Training Zones Table */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-metric-sm text-xs text-primary font-bold uppercase tracking-wider">
              {t("onerm.trainingZones")}
            </h4>
            <span className="font-label-caps text-[11px] text-on-surface-variant">
              % of 1RM Target
            </span>
          </div>

          {/* Handled 4 states: Loading, Empty, Error, and List */}
          {weight <= 0 ? (
            <div className="p-4 text-center text-xs text-error font-body-md bg-error-container/20 rounded-xl border border-error/30">
              Invalid or zero weight entered. Please enter a positive weight to compute training zones.
            </div>
          ) : TRAINING_ZONES.length === 0 ? (
            <div className="p-4 text-center text-xs text-on-surface-variant bg-surface-container rounded-xl">
              No training zones data available.
            </div>
          ) : (
            <div className="space-y-2">
              {TRAINING_ZONES.map((zone) => {
              const zoneWeight = Math.round(average1rm * zone.pct * 10) / 10;
              const isCurrentZone = reps >= zone.minReps && reps <= zone.maxReps;
              const zoneLabel = t(zone.labelKey) !== zone.labelKey ? t(zone.labelKey) : zone.defaultLabel;
              const zoneDesc = t(zone.adaptationKey) !== zone.adaptationKey ? t(zone.adaptationKey) : zone.defaultAdaptation;

              return (
                <div
                  key={zone.pct}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isCurrentZone
                      ? "border-secondary bg-secondary/5 ring-1 ring-secondary"
                      : "border-border bg-surface-container-low"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold ${
                        isCurrentZone
                          ? "bg-secondary text-on-secondary"
                          : "bg-surface-container-highest text-primary"
                      }`}
                    >
                      <span>{Math.round(zone.pct * 100)}%</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-metric-sm text-xs font-bold text-primary">
                          {zoneLabel}
                        </span>
                        <span className="text-[11px] text-on-surface-variant font-medium">
                          ({zone.repRange})
                        </span>
                        {isCurrentZone && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary text-on-secondary">
                            Your Set
                          </span>
                        )}
                      </div>
                      <p className="font-body-md text-[11px] text-on-surface-variant line-clamp-1">
                        {zoneDesc}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-metric-sm text-sm font-extrabold text-primary block">
                      {zoneWeight} {unit}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      per set
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Submaximal Guidance Notice */}
        <div className="mt-4 p-3 rounded-xl bg-surface-container-low border border-border flex items-start gap-2.5 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">
            lightbulb
          </span>
          <p className="font-body-md text-[11px] leading-relaxed">
            {t("onerm.submaxNotice")}
            {!isValidSubmax && (
              <span className="block text-error font-medium mt-1">
                Note: Sets with more than 15 reps reflect endurance capacity and have wider variance when estimating max force.
              </span>
            )}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover font-metric-sm text-metric-sm text-on-primary transition-colors shadow-sm"
          >
            {t("onerm.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
