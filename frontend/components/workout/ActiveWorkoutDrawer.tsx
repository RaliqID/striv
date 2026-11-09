"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";
import { useActiveWorkout } from "@/lib/active-workout";

export default function ActiveWorkoutDrawer() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { activeWorkout } = useActiveWorkout();
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  // Live elapsed timer tick
  useEffect(() => {
    if (!activeWorkout) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Compute live duration
  const durationText = useMemo(() => {
    if (!activeWorkout?.startedAt) return "00:00";
    const startMs = new Date(activeWorkout.startedAt).getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, [activeWorkout?.startedAt, now]);

  // Hidden on active workout screen itself or when no session exists
  if (!activeWorkout || !activeWorkout.sessionId) return null;
  if (pathname === "/workout/active") return null;

  // Collapsed floating pill state
  if (collapsed) {
    return (
      <div
        className="fixed bottom-[72px] right-3 md:bottom-6 md:right-8 z-40 animate-fadeIn"
        role="region"
        aria-label={t("workout.activeWorkout")}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3 py-2 text-primary shadow-xl hover:bg-surface-container-high transition-colors focus:outline-none"
          title={t("workout.expandDrawer")}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
          </span>
          <span className="material-symbols-outlined text-[18px]">fitness_center</span>
          <span className="font-metric-sm text-metric-sm tabular-nums font-bold">
            {durationText}
          </span>
        </button>
      </div>
    );
  }

  const completedSets = activeWorkout.completedSetsCount ?? 0;
  const totalSets = activeWorkout.totalSetsCount ?? 0;

  return (
    <aside
      className="fixed bottom-[72px] inset-x-3 md:inset-x-auto md:bottom-6 md:right-8 md:w-[410px] z-40 bg-surface border border-outline-variant rounded-xl p-3 md:p-3.5 shadow-2xl transition-all animate-fadeIn"
      role="region"
      aria-label={t("workout.activeWorkout")}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left Information Column */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Animated pulsing active indicator */}
          <div className="w-10 h-10 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center shrink-0 relative">
            <span className="material-symbols-outlined text-primary text-[22px]">fitness_center</span>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-label-caps text-[10px] font-bold uppercase tracking-wider text-secondary">
                {t("workout.inProgressStatus")}
              </span>
            </div>

            <p className="font-metric-sm text-metric-sm text-primary font-semibold truncate leading-tight mt-0.5">
              {activeWorkout.name || t("workout.session")}
            </p>

            <div className="flex items-center gap-2 text-on-surface-variant font-label-caps text-[11px] mt-0.5">
              <span className="flex items-center gap-1 tabular-nums font-medium text-primary">
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">schedule</span>
                {durationText}
              </span>

              {totalSets > 0 && (
                <>
                  <span className="text-outline-variant">•</span>
                  <span className="tabular-nums">
                    {completedSets}/{totalSets} {t("progress.sets").toLowerCase()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Column */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            href="/workout/active"
            className="flex items-center gap-1 bg-primary text-on-primary hover:bg-primary-hover px-3.5 py-2 rounded-lg font-metric-sm text-xs font-semibold shadow-sm transition-transform active:scale-95 whitespace-nowrap"
          >
            <span>{t("workout.resumeWorkout")}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>

          {/* Minimize Button */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
            title={t("workout.minimizeDrawer")}
            aria-label={t("workout.minimizeDrawer")}
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
