"use client";

import { Progression } from "@/lib/progression";
import { useTranslation } from "@/lib/i18n/provider";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The member's level and progress toward the next one.
 *
 * Lives in the sidebar rather than on a dedicated page because progression only
 * motivates when it is ambient. A number a member has to go and look up is a
 * statistic; a bar that fills while they use the app is a reason to come back.
 *
 * Two shapes, because the rail has two states:
 *   collapsed — a level badge only, since there is no room for a label and the
 *               number alone still reads at a glance.
 *   expanded  — the badge, the numbers, and the bar.
 */
export default function XpBar({
  progression,
  collapsed,
  badgeCount,
}: {
  progression: Progression | null;
  collapsed: boolean;
  /** Earned/total badges, shown when the rail is expanded. Omit to hide. */
  badgeCount?: { earned: number; total: number } | null;
}) {
  const { t } = useTranslation();

  /*
   * Whether the placeholder is still earning its place.
   *
   * A skeleton is only honest while data is genuinely in flight. If the payload
   * never arrives — the field was missing, the request failed, progression could
   * not be computed — the placeholder becomes a permanent empty box in the
   * sidebar, which reads as a broken UI rather than as a missing number. That is
   * exactly what happened when login omitted `progression`: the rail showed a
   * pulsing grey rectangle forever, with nothing to explain it.
   *
   * So the skeleton is time-boxed. If the data lands, it is replaced by the real
   * bar; if it does not, the component renders NOTHING, which is a clean absence
   * rather than a suspicious void. A missing bar is unremarkable; an empty box
   * invites the question this one raised.
   */
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    // Cleared as soon as real data arrives, so a slow-but-successful load still
    // shows the skeleton rather than flashing nothing.
    if (progression) {
      setWaiting(false);

      return;
    }

    const timer = setTimeout(() => setWaiting(false), 2500);

    return () => clearTimeout(timer);
  }, [progression]);

  if (!progression) {
    // Collapsed rail has no room for a placeholder anyway, and an expanded one
    // stops showing one once the wait is over.
    if (collapsed || !waiting) return null;

    return (
      <div
        className="mx-3 mb-2 h-[62px] animate-pulse rounded-lg border border-outline-variant bg-surface-container-highest"
        aria-hidden="true"
      />
    );
  }

  const { level, progress_percent, xp_to_next_level, next_level } = progression;

  if (collapsed) {
    return (
      <Link
        href="/achievements"
        title={t("level.levelN", { level })}
        aria-label={t("level.levelN", { level })}
        className="mx-3 mb-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 transition-colors hover:bg-primary/20"
      >
        <span className="font-metric-sm text-metric-sm font-bold text-primary">{level}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/achievements"
      className="mx-3 mb-2 block rounded-lg border border-outline-variant bg-surface-container-highest p-3 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
            <span className="font-label-caps text-label-caps font-bold text-on-primary">
              {level}
            </span>
          </span>
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            {t("level.levelN", { level })}
          </span>
        </div>

        {badgeCount && badgeCount.total > 0 && (
          <span className="flex items-center gap-1 font-label-caps text-label-caps text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              military_tech
            </span>
            {badgeCount.earned}/{badgeCount.total}
          </span>
        )}
      </div>

      {/* The bar is the point: it must read as nearly-full or nearly-empty at a
          glance, so the fill is rounded and the track is visible underneath. */}
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
        role="progressbar"
        aria-valuenow={progress_percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("level.progressLabel")}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress_percent}%` }}
        />
      </div>

      <p className="mt-1.5 font-label-caps text-label-caps text-on-surface-variant">
        {t("level.toNextLevel", { xp: xp_to_next_level, level: next_level })}
      </p>
    </Link>
  );
}
