"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import { soundFx } from "@/lib/audio";

interface RestTimerProps {
  active: boolean;
  secondsRemaining: number | null;
  totalSeconds: number;
  onClose: () => void;
  onSkip: () => void;
  onSetSeconds: (seconds: number) => void;
  onAddSeconds: (delta: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
}

export default function RestTimer({
  active,
  secondsRemaining,
  totalSeconds,
  onClose,
  onSkip,
  onSetSeconds,
  onAddSeconds,
  isPaused,
  onTogglePause,
}: RestTimerProps) {
  const { t } = useTranslation();
  const [minimized, setMinimized] = useState(false);
  const [muted, setMuted] = useState(false);
  const lastPlayedSecondRef = useRef<number | null>(null);

  // Sync mute state on mount
  useEffect(() => {
    setMuted(soundFx.isMuted());
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = soundFx.toggleMuted();
    setMuted(next);
  }, []);

  // Audio & haptic triggers during countdown
  useEffect(() => {
    if (!active || secondsRemaining === null || isPaused) return;

    if (lastPlayedSecondRef.current === secondsRemaining) return;
    lastPlayedSecondRef.current = secondsRemaining;

    // Warning beeps on last 3, 2, 1 seconds
    if (secondsRemaining > 0 && secondsRemaining <= 3) {
      soundFx.playBeep(880, 0.09);
      soundFx.vibrate(45);
    } else if (secondsRemaining === 0) {
      // Completion chime
      soundFx.playFinishChime();
      soundFx.vibrate([120, 60, 180]);
    }
  }, [active, secondsRemaining, isPaused]);

  if (!active || secondsRemaining === null) return null;

  const formatMinutesSeconds = (sec: number) => {
    const safe = Math.max(0, Math.floor(sec));
    const m = Math.floor(safe / 60).toString().padStart(2, "0");
    const s = (safe % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const currentSec = Math.max(0, secondsRemaining);
  const safeTotal = Math.max(1, totalSeconds);
  const progressRatio = Math.min(1, Math.max(0, currentSec / safeTotal));

  // Circular progress math: radius 52, circumference 2 * PI * 52 = 326.72
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progressRatio);

  // Compact floating pill mode (minimized)
  if (minimized) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface border border-outline-variant rounded-full pl-2 pr-3 py-1.5 shadow-xl transition-all animate-fadeIn"
        role="timer"
        aria-live="polite"
        aria-label={t("workout.restTimer")}
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2.5 focus:outline-none"
          title={t("workout.expandTimer")}
        >
          {/* Mini progress ring */}
          <div className="relative w-9 h-9 flex items-center justify-center">
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 40 40">
              <circle
                cx="20"
                cy="20"
                r="16"
                className="stroke-surface-container-highest"
                strokeWidth="3"
                fill="none"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                className="stroke-primary transition-all duration-300 ease-linear"
                strokeWidth="3"
                strokeDasharray={2 * Math.PI * 16}
                strokeDashoffset={2 * Math.PI * 16 * (1 - progressRatio)}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="material-symbols-outlined text-primary text-[16px] absolute">
              {isPaused ? "pause" : "timer"}
            </span>
          </div>

          <div className="flex flex-col text-left">
            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant leading-none">
              {isPaused ? t("workout.pause") : t("workout.resting")}
            </span>
            <span className="font-metric-sm text-metric-sm tabular-nums text-primary font-bold">
              {formatMinutesSeconds(currentSec)}
            </span>
          </div>
        </button>

        <div className="h-5 w-px bg-outline-variant" />

        <button
          type="button"
          onClick={() => onAddSeconds(30)}
          className="px-2 py-1 text-xs font-semibold rounded bg-surface-container hover:bg-surface-container-high transition-colors text-primary"
          title={t("workout.add30s")}
        >
          {t("workout.add30s")}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="px-2.5 py-1 text-xs font-semibold rounded bg-primary text-on-primary hover:bg-primary-hover transition-colors"
        >
          {t("workout.skipRest")}
        </button>
      </div>
    );
  }

  // Full Expanded Rest Sheet / Modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] p-0 sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={t("workout.restTimer")}
    >
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-xl bg-surface border border-outline-variant p-6 shadow-2xl flex flex-col items-center">
        {/* Header Bar */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-outline-variant/60 mb-5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
            <h2 className="font-metric-sm text-metric-sm text-primary font-semibold tracking-tight">
              {t("workout.restTimer")}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Mute Toggle */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
              title={muted ? t("workout.soundMuted") : t("workout.soundOn")}
              aria-label={muted ? t("workout.soundMuted") : t("workout.soundOn")}
            >
              <span className="material-symbols-outlined text-[18px]">
                {muted ? "volume_off" : "volume_up"}
              </span>
            </button>

            {/* Minimize */}
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
              title={t("workout.minimizeTimer")}
              aria-label={t("workout.minimizeTimer")}
            >
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
              title={t("workout.closeRestTimer")}
              aria-label={t("workout.closeRestTimer")}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Circular Countdown Progress Ring */}
        <div className="relative my-2 flex items-center justify-center">
          <svg className="w-48 h-48 -rotate-90" viewBox="0 0 128 128">
            {/* Track Background */}
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              className="stroke-surface-container-highest"
              strokeWidth="7"
              fill="none"
            />
            {/* Active Animated Progress Arc */}
            <circle
              cx="64"
              cy="64"
              r={RADIUS}
              className={`transition-all duration-300 ease-linear ${
                currentSec <= 3 && currentSec > 0
                  ? "stroke-error"
                  : "stroke-primary"
              }`}
              strokeWidth="7"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          {/* Centered Numbers */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-label-caps text-[11px] tracking-widest uppercase text-on-surface-variant">
              {isPaused ? t("workout.pause") : t("workout.resting")}
            </span>
            <span
              className={`font-metric-display text-[44px] leading-tight font-black tabular-nums tracking-tighter ${
                currentSec <= 3 && currentSec > 0 ? "text-error animate-pulse" : "text-primary"
              }`}
            >
              {formatMinutesSeconds(currentSec)}
            </span>
            <span className="font-label-caps text-[11px] text-muted">
              / {formatMinutesSeconds(safeTotal)}
            </span>
          </div>
        </div>

        {/* Preset Selector Chips */}
        <div className="w-full mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onSetSeconds(60)}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              safeTotal === 60
                ? "bg-primary text-on-primary border-primary shadow-sm"
                : "bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container-high"
            }`}
          >
            60s
          </button>
          <button
            type="button"
            onClick={() => onSetSeconds(90)}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              safeTotal === 90
                ? "bg-primary text-on-primary border-primary shadow-sm"
                : "bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container-high"
            }`}
          >
            90s
          </button>
          <button
            type="button"
            onClick={() => onSetSeconds(120)}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              safeTotal === 120
                ? "bg-primary text-on-primary border-primary shadow-sm"
                : "bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container-high"
            }`}
          >
            120s
          </button>
        </div>

        {/* Step Adjust Buttons (-15s, +15s, +30s) */}
        <div className="w-full mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onAddSeconds(-15)}
            disabled={currentSec <= 15}
            className="py-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low text-xs font-semibold text-on-surface disabled:opacity-40 transition-colors"
          >
            {t("workout.minus15s")}
          </button>
          <button
            type="button"
            onClick={() => onAddSeconds(15)}
            className="py-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low text-xs font-semibold text-on-surface transition-colors"
          >
            {t("workout.plus15s")}
          </button>
          <button
            type="button"
            onClick={() => onAddSeconds(30)}
            className="py-1.5 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container-low text-xs font-semibold text-on-surface transition-colors"
          >
            {t("workout.add30s")}
          </button>
        </div>

        {/* Primary Controls (Pause/Resume & Skip Rest) */}
        <div className="w-full mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePause}
            className="flex-1 py-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container-high font-metric-sm text-metric-sm text-primary flex items-center justify-center gap-1.5 transition-colors font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isPaused ? "play_arrow" : "pause"}
            </span>
            {isPaused ? t("workout.resumeTimer") : t("workout.pause")}
          </button>

          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-3 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-metric-sm text-metric-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">fast_forward</span>
            {t("workout.skipRest")}
          </button>
        </div>
      </div>
    </div>
  );
}
