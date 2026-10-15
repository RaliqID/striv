"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { useTranslation } from "@/lib/i18n/provider";
import {
  AchievementBadge,
  ProgressionStats,
  fetchAchievements,
  fetchProgression,
  xpSourceKey,
} from "@/lib/progression";

/**
 * Where badges live, plus the XP ledger.
 *
 * Two deliberate choices:
 *
 * 1. LOCKED badges are shown alongside earned ones. A grid of only what you
 *    already have is a trophy shelf; a grid that includes the next tier with
 *    its requirement is a set of goals. The bottom of this page is the reason
 *    to open it more than once.
 *
 * 2. The XP ledger is on the same page. "Why am I Level 4" is the first
 *    question a progression system invites, and the answer is the list of
 *    every award with its date. Putting it here means the number is never
 *    unexplained.
 */
export default function AchievementsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [stats, setStats] = useState<ProgressionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetched together: the page is meaningless with one and not the other,
      // and two sequential round trips would show a half-built screen.
      const [achievementsRes, statsRes] = await Promise.all([
        fetchAchievements(),
        fetchProgression(),
      ]);

      // Guarded: a 200 response with an unexpected shape (no `achievements`
      // array, or a non-object stats body) must not become `undefined` state —
      // `badges.filter(...)` below would then throw and blank the whole page.
      setBadges(
        Array.isArray(achievementsRes?.achievements)
          ? achievementsRes.achievements
          : []
      );
      setStats(statsRes && typeof statsRes === "object" ? statsRes : null);
    } catch (err: any) {
      if (err?.status === 401) {
        router.push("/login");
        return;
      }
      setError(err?.message || t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    load();
  }, [load]);

  const earned = badges.filter((b) => b.unlocked).length;

  /*
   * Group by category so the page reads as sections rather than one long grid.
   * Categories with nothing in them are dropped, so a member who has not yet
   * touched a category never sees an empty heading.
   */
  const categories = ["milestone", "streak", "strength", "consistency"] as const;

  const grouped = categories
    .map((category) => ({
      category,
      labelKey: `achievements.category${category.charAt(0).toUpperCase()}${category.slice(1)}`,
      items: badges.filter((b) => b.category === category),
    }))
    .filter((group) => group.items.length > 0);

  /*
   * Normalise the progression block.
   *
   * The backend degrades to an empty array for `progress` when its own service
   * throws (ProgressionController::stats), and any of `progress`, `daily` or
   * `recent_events` can be absent from a 200 body. Reading `stats.daily.cap` or
   * `stats.recent_events.length` off that would throw during render and blank
   * the page — which is exactly the failure this page must never have, since the
   * whole point of it is that a member's progress is explained. So each piece is
   * narrowed to a safe value here and the card renders off the narrowed copies.
   */
  const progress =
    stats && stats.progress && !Array.isArray(stats.progress)
      ? stats.progress
      : null;
  const daily =
    stats && stats.daily && typeof stats.daily === "object" ? stats.daily : null;
  const recentEvents = Array.isArray(stats?.recent_events)
    ? stats.recent_events
    : [];

  return (
    <AppLayout>
      <div className="flex animate-fadeIn flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="font-metric-display text-headline-lg-mobile tracking-tight text-primary md:text-metric-display">
              {t("achievements.title")}
            </h1>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {t("achievements.subtitle")}
            </p>
          </div>

          {/* Level summary sits directly under the title: the page is about
              progression, and this is the headline number for it. */}
          {progress && (
            <div className="rounded-xl border border-outline-variant bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                    <span className="font-metric-sm text-metric-sm font-bold text-on-primary">
                      {progress.level}
                    </span>
                  </span>
                  <div>
                    <p className="font-metric-sm text-metric-sm text-on-surface">
                      {t("level.levelN", { level: progress.level })}
                    </p>
                    <p className="font-label-caps text-label-caps text-on-surface-variant">
                      {t("level.xpTotal", { xp: progress.total_xp })}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    {t("achievements.earnedCount", {
                      earned,
                      total: badges.length,
                    })}
                  </p>
                  {progress.rank !== null && (
                    <p className="font-label-caps text-label-caps text-on-surface-variant">
                      {t("leaderboard.yourRank", { rank: progress.rank })}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between font-label-caps text-label-caps text-on-surface-variant">
                  <span>{t("level.toNextLevel", {
                    xp: progress.xp_to_next_level,
                    level: progress.next_level,
                  })}</span>
                  <span>
                    {progress.progress_percent}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-container"
                  role="progressbar"
                  aria-valuenow={progress.progress_percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("level.progressLabel")}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${progress.progress_percent}%` }}
                  />
                </div>
              </div>

              {/* Shown only when the cap is actually in play — otherwise it is
                  noise about a limit nobody is near. */}
              {daily && daily.remaining < daily.cap && (
                <p className="mt-3 font-label-caps text-label-caps text-on-surface-variant">
                  {daily.remaining === 0
                    ? t("xp.capReached")
                    : t("xp.dailyCap", {
                        remaining: daily.remaining,
                        cap: daily.cap,
                      })}
                </p>
              )}
            </div>
          )}
        </header>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl border border-outline-variant bg-surface"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <p className="font-body-md text-body-md text-on-surface-variant">{error}</p>
            <button
              onClick={load}
              className="rounded-full bg-primary px-6 py-2 font-medium text-on-primary transition-colors hover:bg-primary/80"
            >
              {t("action.retry")}
            </button>
          </div>
        ) : (
          <>
            {grouped.map((group) => (
              <section key={group.category} className="flex flex-col gap-3">
                <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                  {t(group.labelKey)}
                </h2>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((badge) => (
                    <BadgeCard key={badge.key} badge={badge} />
                  ))}
                </div>
              </section>
            ))}

            {/* The ledger — the receipt for every point. */}
            {recentEvents.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                  {t("xp.recentTitle")}
                </h2>

                <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
                  {recentEvents.map((event, index) => (
                    <div
                      key={event.id}
                      className={`flex items-center justify-between gap-4 px-4 py-3 ${
                        index > 0 ? "border-t border-outline-variant" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`material-symbols-outlined shrink-0 text-[20px] ${
                            event.amount < 0 ? "text-error" : "text-primary"
                          }`}
                          aria-hidden="true"
                        >
                          {event.amount < 0 ? "remove_circle" : "add_circle"}
                        </span>
                        <span className="truncate font-body-md text-body-md text-on-surface">
                          {labelForEvent(event, t)}
                        </span>
                      </div>

                      <span
                        className={`shrink-0 font-metric-sm text-metric-sm ${
                          event.amount < 0 ? "text-error" : "text-primary"
                        }`}
                      >
                        {event.amount > 0 ? "+" : ""}
                        {event.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * A badge tile.
 *
 * Locked tiles are dimmed and greyscale rather than hidden, and always show
 * their requirement — the requirement is the useful part, and a member cannot
 * chase a goal they cannot read.
 */
function BadgeCard({ badge }: { badge: AchievementBadge }) {
  const { t, locale } = useTranslation();

  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors ${
        badge.unlocked
          ? "border-primary/40 bg-primary/5"
          : "border-outline-variant bg-surface"
      }`}
    >
      {badge.unlocked && !badge.seen && (
        <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-primary">
          {t("achievements.new")}
        </span>
      )}

      <span
        className={`material-symbols-outlined text-[32px] ${
          badge.unlocked ? "text-primary" : "text-outline"
        }`}
        style={badge.unlocked ? { fontVariationSettings: "'FILL' 1" } : {}}
        aria-hidden="true"
      >
        {badge.unlocked ? badge.icon : "lock"}
      </span>

      <p
        className={`font-metric-sm text-metric-sm ${
          badge.unlocked ? "text-on-surface" : "text-on-surface-variant"
        }`}
      >
        {t(badge.name_key)}
      </p>

      <p className="font-label-caps text-label-caps text-on-surface-variant">
        {t(badge.description_key)}
      </p>

      <span
        className={`mt-auto rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
          badge.unlocked
            ? "bg-primary/10 text-primary"
            : "bg-surface-container text-on-surface-variant"
        }`}
      >
        +{badge.xp_reward} XP
      </span>

      {badge.unlocked && badge.unlocked_at && (
        <span className="font-label-caps text-label-caps text-outline">
          {t("achievements.unlockedOn", {
            date: new Date(badge.unlocked_at).toLocaleDateString(locale),
          })}
        </span>
      )}
    </div>
  );
}

/**
 * Human label for a ledger row.
 *
 * An achievement award carries an i18n KEY as its label (the backend stores
 * `achievements.firstSession`), while other sources carry free text such as an
 * exercise name. Those two cases must be distinguished, or the ledger prints
 * raw dotted keys for badges and translated labels for everything else.
 */
function labelForEvent(
  event: { source: string; label: string | null },
  t: (key: string, vars?: Record<string, any>) => string
): string {
  if (event.source === "achievement" && event.label?.startsWith("achievements.")) {
    return t(event.label);
  }

  // A PR row is labelled with the exercise name, which is data, not copy.
  if (event.source === "pr_set" && event.label) {
    return `${t("xp.pr_set")} · ${event.label}`;
  }

  return t(xpSourceKey(event.source));
}
