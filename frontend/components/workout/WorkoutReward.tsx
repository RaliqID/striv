"use client";

import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import { useEffect, useState } from "react";
import type { SessionXp, UnlockedBadge } from "@/lib/progression";

/** What the server computed about this session. */
export interface Reward {
  summary: {
    exercises: number;
    sets: number;
    proven_sets: number;
    volume_kg: number;
    duration_minutes: number | null;
    finished_at: string | null;
  };
  personal_records: {
    id: number;
    exercise_id: number;
    exercise_name: string | null;
    type: string;
    value: number;
    previous_value: number | null;
    delta: number | null;
    is_first: boolean;
  }[];
  streak: { current: number; this_week_count: number; is_record: boolean };
  comparison: {
    this_session_volume_kg: number;
    last_week_volume_kg: number;
    delta_pct: number;
    direction: "up" | "down" | "flat";
  } | null;
  praise: string | null;
  has_reward: boolean;
}

/**
 * The screen a member sees the moment they finish.
 *
 * Deliberately ordered by emotional weight rather than by data importance: the
 * PR first, then the streak, then progress, then the coach's line. Numbers alone
 * are a readout; this sequence is what makes finishing feel like it counted.
 *
 * Each block renders only when it has something real to say. An empty streak
 * card or a "+0%" would undercut the blocks that do have news, so a first-time
 * session shows fewer cards rather than padded ones.
 *
 * XP and badges close the sequence, after the session totals: XP arrives every
 * session so it reads as a footnote, while a badge is rare enough to sit just
 * above it as the thing worth scrolling to.
 */
export default function WorkoutReward({ reward, xp, badges }: {
  reward: Reward;
  xp?: SessionXp | null;
  badges?: UnlockedBadge[] | null;
}) {
  const { t } = useTranslation();
  const { label, formatWeight, formatVolume } = useUnit();

  // Stagger the blocks in so the screen builds rather than appearing at once.
  // A static screen reads as a receipt; a screen that assembles reads as a
  // result.
  const [revealed, setRevealed] = useState(0);

  // Seven steps now: the five original blocks plus the badges (6) and the XP
  // block (7). The array must cover every index we `show()`, or the new blocks
  // would pop in immediately while the rest are still animating.
  useEffect(() => {
    const timers = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), 120 * i)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  const show = (n: number) => revealed >= n;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {/* Headline: trophy + a line that changes when something was achieved. */}
      <div
        className={`flex flex-col items-center gap-4 transition-all duration-500 ${
          show(1) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full ${
            reward.personal_records.length > 0 ? "bg-primary" : "bg-secondary-fixed"
          }`}
        >
          <span
            className={`material-symbols-outlined text-[40px] ${
              reward.personal_records.length > 0 ? "text-on-primary" : "text-on-secondary-fixed"
            }`}
          >
            {reward.personal_records.length > 0 ? "military_tech" : "emoji_events"}
          </span>
        </div>

        <h1 className="text-center font-headline-lg text-headline-lg tracking-tight text-primary">
          {reward.personal_records.length > 0
            ? t("reward.newRecordTitle")
            : t("workout.complete")}
        </h1>
      </div>

      {/* Coach line — first thing after the headline, because a human sentence
          lands harder than a statistic. */}
      {reward.praise && (
        <div
          className={`w-full rounded-xl border border-primary/30 bg-primary/5 p-5 transition-all duration-500 ${
            show(2) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-primary">
              support_agent
            </span>
            <p className="font-body-md text-body-md text-on-surface">{reward.praise}</p>
          </div>
        </div>
      )}

      {/*
        Personal records, one card per EXERCISE rather than one per PR type.
        
        An exercise produces up to three records at once (weight, estimated
        1RM, session volume), so rendering a row per record printed "Barbell
        Bench Press" three times in a column — which reads as a rendering bug
        and dilutes the achievement. Only the headline number is shown, and the
        extra types are collapsed into a count.
      */}
      {reward.personal_records.length > 0 && (
        <div
          className={`w-full space-y-2 transition-all duration-500 ${
            show(3) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          {groupRecordsByExercise(reward.personal_records).map((group) => (
            <div
              key={group.exerciseId}
              className="flex items-center justify-between gap-4 rounded-xl border border-primary bg-surface p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="material-symbols-outlined shrink-0 text-[24px] text-primary">
                  trophy
                </span>
                <div className="min-w-0">
                  <p className="truncate font-metric-sm text-metric-sm text-on-surface">
                    {group.exerciseName ?? t("reward.exercise")}
                  </p>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">
                    {group.headline.is_first
                      ? t("reward.firstRecord")
                      : t("reward.beatsPrevious")}
                    {group.extra > 0 && (
                      <span className="ml-1">
                        · {t("reward.moreRecords", { count: group.extra })}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-metric-display text-metric-display leading-none text-primary">
                  {formatWeight(group.headline.value)}
                  {/* Real space, not a margin: see the streak comment below. A
                      margin leaves textContent as "100kg". */}
                  {" "}
                  <span className="font-metric-sm text-metric-sm text-on-surface-variant">{label}</span>
                </p>
                {group.headline.delta !== null && group.headline.delta > 0 && (
                  /*
                   * The delta and the previous best are masses too, so they
                   * convert with the same factor as the headline. Printing them
                   * in kg next to a pound figure would make the arithmetic on
                   * the card look wrong — "220.5 lbs, +2.2 kg from 200".
                   */
                  <p className="font-label-caps text-label-caps text-primary">
                    +{formatWeight(group.headline.delta)} {label} {t("reward.from")}{" "}
                    {group.headline.previous_value !== null
                      ? formatWeight(group.headline.previous_value)
                      : "—"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Streak + comparison, side by side: two different kinds of progress. */}
      <div
        className={`grid w-full gap-3 sm:grid-cols-2 transition-all duration-500 ${
          show(4) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {reward.streak.current >= 2 && (
          <div className="rounded-xl border border-outline-variant bg-surface p-5">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
              <span className="font-label-caps text-label-caps uppercase">
                {t("reward.streak")}
              </span>
            </div>
            <p className="mt-2 font-metric-display text-metric-display text-primary">
              {reward.streak.current}
              {/*
                The space is a real space character, not just a margin.

                JSX collapses the whitespace between an expression and the text
                after it, so this originally rendered as "5minggu". A margin
                (ml-2) was added to restore the visual gap, which it does — but a
                margin is invisible to the DOM: textContent was still "5minggu",
                so assistive tech reads it as one word and a copied selection
                loses the separator. An explicit {" "} fixes both the gap and the
                text, which a margin alone cannot.
              */}
              {" "}
              <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                {t("reward.weeks")}
              </span>
            </p>
            {reward.streak.is_record && (
              <p className="mt-1 font-label-caps text-label-caps text-primary">
                {t("reward.streakRecord")}
              </p>
            )}
          </div>
        )}

        {/*
          Only an UPWARD comparison is shown.
          
          A decline was previously rendered here as "-96.4% vs last week" — in
          large type, on a screen whose only job is to make finishing feel worth
          it. The member can see a dip on the dashboard and progress screens,
          where the frame is analytical; here it just punishes them for having
          opened the app.
        */}
        {reward.comparison && reward.comparison.direction === "up" && (
          <div className="rounded-xl border border-outline-variant bg-surface p-5">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
              <span className="font-label-caps text-label-caps uppercase">
                {t("reward.vsLastWeek")}
              </span>
            </div>
            <p className="mt-2 font-metric-display text-metric-display text-primary">
              +{reward.comparison.delta_pct}
              {/* Real space, not a margin: textContent would read "+18%" as one
                  token. Same reason as the streak and kg units above. */}
              {" "}
              <span className="font-metric-sm text-metric-sm text-on-surface-variant">%</span>
            </p>
            <p className="mt-1 font-label-caps text-label-caps text-on-surface-variant">
              {t("reward.volumeLastWeek", {
                value: formatVolume(reward.comparison.last_week_volume_kg),
                unit: label,
              })}
            </p>
          </div>
        )}
      </div>

      {/* Session totals — the least emotional data, so it sits at the bottom as
          context rather than as the headline. */}
      <div
        className={`grid w-full grid-cols-3 gap-3 transition-all duration-500 ${
          show(5) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <Stat label={t("nav.exercises")} value={String(reward.summary.exercises)} />
        <Stat label={t("progress.sets")} value={String(reward.summary.sets)} />
        <Stat
          label={t("progress.volume")}
          value={formatVolume(reward.summary.volume_kg)}
          suffix={label}
        />
      </div>

      {/*
        Unlocked badges — placed above the XP block because a badge is the
        rarer event. XP arrives every session; a badge crosses a threshold once.
        Below this line the screen would read as routine, not as a reward.

        Names come from `name_key`, an i18n key resolved through `t`, so the
        chip follows the member's language and never prints the raw key.
      */}
      {badges && badges.length > 0 && (
        <div
          className={`w-full space-y-2 transition-all duration-500 ${
            show(6) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            {t("reward.badgesUnlocked", { count: badges.length })}
          </p>
          {badges.map((badge) => (
            <div
              key={badge.key}
              className="flex items-center gap-4 rounded-xl border border-primary bg-primary/5 p-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary">
                <span className="material-symbols-outlined text-[24px] text-on-primary">
                  {badge.icon}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-metric-sm text-metric-sm text-on-surface">
                  {t(badge.name_key)}
                </p>
                <p className="font-label-caps text-label-caps text-primary">
                  {t("reward.newBadge")}
                </p>
              </div>
              <span className="shrink-0 font-label-caps text-label-caps text-primary">
                +{badge.xp_reward}
                {/* Explicit margin: JSX collapses whitespace between an
                    expression and the following text ("50XP"). The unit is a
                    translation key so it is not hardcoded English. */}
                <span className="ml-1">{t("leaderboard.xp")}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/*
        XP earned — the closing note. It reports every session, so it carries
        the least surprise of any block; the one moment it IS the news is a
        level-up, which is surfaced first inside this block so it cannot be
        buried under a number the member sees every time.
      */}
      {xp && xp.earned > 0 && (
        <div
          className={`w-full space-y-3 rounded-xl border border-outline-variant bg-surface p-5 transition-all duration-500 ${
            show(7) ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          {xp.leveled_up && (
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[28px] text-primary">
                workspace_premium
              </span>
              <p className="font-headline-md text-headline-md tracking-tight text-primary">
                {t("reward.levelUp", { level: xp.progress.level })}
              </p>
            </div>
          )}

          <div className="flex items-baseline gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">bolt</span>
            <p className="font-metric-display text-metric-display leading-none text-primary">
              {t("reward.xpEarned", { xp: xp.earned })}
            </p>
          </div>

          <div>
            <div
              role="progressbar"
              aria-valuenow={xp.progress.progress_percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("level.progressLabel")}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${xp.progress.progress_percent}%` }}
              />
            </div>
            <p className="mt-2 font-label-caps text-label-caps text-on-surface-variant">
              {t("level.toNextLevel", {
                xp: xp.progress.xp_to_next_level,
                level: xp.progress.next_level,
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Collapse one exercise's records into a single card.
 *
 * An exercise yields up to three records in one session (weight, estimated
 * 1RM, session volume). Rendering them all printed the exercise name three
 * times, which reads as a bug.
 *
 * `weight` is chosen as the headline because it is the number a member can
 * picture — "I benched 80kg". An estimated 1RM of 93.33kg is a derived figure
 * they never actually lifted, and it is confusing as the headline figure on a
 * reward card.
 */
function groupRecordsByExercise(records: Reward["personal_records"]) {
  const groups = new Map<
    number,
    { exerciseId: number; exerciseName: string | null; headline: Reward["personal_records"][number]; extra: number }
  >();

  for (const pr of records) {
    const existing = groups.get(pr.exercise_id);

    if (!existing) {
      groups.set(pr.exercise_id, {
        exerciseId: pr.exercise_id,
        exerciseName: pr.exercise_name,
        headline: pr,
        extra: 0,
      });
      continue;
    }

    existing.extra++;

    // Prefer the weight record as the headline; fall back to the first.
    if (pr.type === "weight" && existing.headline.type !== "weight") {
      existing.headline = pr;
    }
  }

  return [...groups.values()];
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-outline-variant bg-surface p-4">
      <span className="text-center font-label-caps text-label-caps uppercase text-on-surface-variant">
        {label}
      </span>
      <span className="font-metric-sm text-metric-sm text-primary">
        {value}
        {suffix && (
          /*
           * A real space, not a margin.
           *
           * This is the shared Stat used by volume, sets and exercises, so a
           * margin here rendered every one of them as a single token —
           * "11750kg" — which is what a screen reader announces and what
           * copy-paste produces.
           */
          <>
            {" "}
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              {suffix}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
