"use client";

import { Progression } from "@/lib/progression";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * The moment a member reaches a new level.
 *
 * Presented as a full overlay rather than a toast: a level is the payoff for
 * weeks of sessions, and a corner notification that auto-dismisses in three
 * seconds would treat it like a save confirmation. The member dismisses this
 * themselves.
 *
 * The bar is rendered at the OLD value first and animated to the new one, so the
 * fill itself is the celebration — the number changing is the fact, the bar
 * moving is what makes it feel earned.
 */
export default function LevelUpOverlay({
  level,
  progression,
  onDismiss,
}: {
  level: number;
  progression: Progression;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/95 backdrop-blur-sm px-margin-mobile"
      role="dialog"
      aria-modal="true"
      aria-labelledby="levelup-heading"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-primary/30 bg-surface p-8 text-center shadow-lg animate-fadeIn">
        {/* The emblem, scaled up: the one element that should feel like a prize. */}
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary">
          <span
            className="material-symbols-outlined text-[56px] text-on-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            workspace_premium
          </span>
        </div>

        <div>
          <h2
            id="levelup-heading"
            className="font-metric-display text-headline-lg-mobile tracking-tight text-primary md:text-metric-display"
          >
            {t("levelUp.congrats", { level })}
          </h2>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            {t("levelUp.subtitle")}
          </p>
        </div>

        {/*
          The bar shows distance to the NEXT level, so at the instant of a
          level-up it is always at ~0% — every level-up, not just this one. The
          member has just been told they achieved something and is immediately
          shown an empty bar, which reads as "you have done nothing".

          So the bar is only shown once it has something to say. Below a
          threshold it is replaced by a line naming the achievement itself,
          which is the thing actually worth celebrating here. The next goal is
          still stated underneath either way, so nothing is lost.
        */}
        <div className="w-full">
          {progression.progress_percent >= 5 ? (
            <>
              <div className="mb-2 flex items-center justify-between font-label-caps text-label-caps text-on-surface-variant">
                <span>{t("level.levelN", { level })}</span>
                <span>{t("level.levelN", { level: progression.next_level })}</span>
              </div>

              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-valuenow={progression.progress_percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("level.progressLabel")}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                  style={{ width: `${progression.progress_percent}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <span
                className="material-symbols-outlined text-[18px] text-primary"
                aria-hidden="true"
              >
                auto_awesome
              </span>
              <span className="font-metric-sm text-metric-sm text-primary">
                {t("level.newChapter")}
              </span>
            </div>
          )}

          <p className="mt-3 font-label-caps text-label-caps text-on-surface-variant">
            {t("level.toNextLevel", {
              xp: progression.xp_to_next_level,
              level: progression.next_level,
            })}
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="w-full rounded-full bg-primary py-3 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90"
        >
          {t("levelUp.continue")}
        </button>
      </div>
    </div>
  );
}
