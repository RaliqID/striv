"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { useTranslation } from "@/lib/i18n/provider";
import { LeaderboardEntry, LeaderboardResponse, fetchLeaderboard } from "@/lib/progression";

/**
 * Members ranked by XP.
 *
 * The member's own row is pinned at the bottom when they are outside the top
 * list. A ranking they cannot find themselves in is discouraging rather than
 * motivating — knowing you are 47th is useful, not seeing you at all is not.
 *
 * Names are display names or masked emails, decided server-side; the frontend
 * never receives a full address, so this page cannot leak one even by mistake.
 */
export default function LeaderboardPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await fetchLeaderboard());
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

  const entries = data?.entries ?? [];
  const me = data?.me ?? null;

  // Only pin the separate row when the member is genuinely outside the list.
  const meIsListed = me !== null && entries.some((e) => e.rank === me.rank);

  return (
    <AppLayout>
      <div className="flex animate-fadeIn flex-col gap-6">
        <header>
          <h1 className="font-metric-display text-headline-lg-mobile tracking-tight text-primary md:text-metric-display">
            {t("leaderboard.title")}
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t("leaderboard.subtitle")}
          </p>
        </header>

        {/* The member's own standing, up top, always. */}
        {me && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="font-metric-display text-metric-display text-primary">
                  #{me.rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-metric-sm text-metric-sm text-on-surface">
                    {t("leaderboard.you")}
                  </p>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">
                    {t("level.levelN", { level: me.level })}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-metric-sm text-metric-sm text-primary">
                {me.xp} XP
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 px-4 py-4 ${
                  i > 0 ? "border-t border-outline-variant" : ""
                }`}
              >
                <div className="h-5 w-8 animate-pulse rounded bg-surface-container" />
                <div className="h-5 flex-1 animate-pulse rounded bg-surface-container" />
                <div className="h-5 w-16 animate-pulse rounded bg-surface-container" />
              </div>
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
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <span className="material-symbols-outlined text-6xl text-outline" aria-hidden="true">
              leaderboard
            </span>
            <p className="text-center font-body-lg text-body-lg text-on-surface-variant">
              {t("leaderboard.empty")}
            </p>
          </div>
        ) : (
          <>
            {/*
              Header row — desktop only.

              The rank column is a fixed w-10 so its label aligns with the rank
              numerals in Row below. The full word "Peringkat" is 76px wide at
              this size but the column is 40px, so it overran the member column
              and the two headers overlapped ("PERINGKAMEMBER"). Since widening
              the column would knock the label out of line with the numbers it
              labels, a "#" is used instead — it is the conventional heading for
              a rank column and fits the space. The self-describing label is
              still available to assistive tech via aria-label.
            */}
            <div className="hidden items-center gap-4 px-4 font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant sm:flex">
              <span className="w-10 shrink-0" aria-label={t("leaderboard.rank")}>
                #{/* short form; full label is on aria-label */}
              </span>
              <span className="min-w-0 flex-1">{t("leaderboard.member")}</span>
              <span className="w-20 shrink-0 text-right">{t("leaderboard.level")}</span>
              <span className="w-24 shrink-0 text-right">{t("leaderboard.xp")}</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
              {entries.map((entry, index) => (
                <Row
                  key={`${entry.rank}-${entry.name}`}
                  entry={entry}
                  first={index === 0}
                />
              ))}
            </div>

            {/* Outside the visible list: shown once more so the member is never
                left without a position. */}
            {me && !meIsListed && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="mb-2 font-label-caps text-label-caps uppercase text-on-surface-variant">
                  {t("leaderboard.yourRank", { rank: me.rank })}
                </p>
                <Row entry={me} first />
              </div>
            )}

            {me === null && (
              <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
                {t("leaderboard.notRanked")}
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

/** A single standing. */
function Row({ entry, first }: { entry: LeaderboardEntry; first: boolean }) {
  // Podium tint for the top three, applied by rank rather than by index so the
  // highlight follows the position even if a list is ever re-sorted.
  const podium =
    entry.rank === 1
      ? "text-primary"
      : entry.rank <= 3
        ? "text-secondary"
        : "text-on-surface-variant";

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3.5 ${
        first ? "" : "border-t border-outline-variant"
      } ${entry.is_me ? "bg-primary/5" : ""}`}
    >
      <span className={`w-10 shrink-0 font-metric-sm text-metric-sm ${podium}`}>
        {entry.rank}
      </span>

      <span className="min-w-0 flex-1 truncate font-body-md text-body-md text-on-surface">
        {entry.name}
      </span>

      <span className="w-20 shrink-0 text-right font-label-caps text-label-caps text-on-surface-variant">
        L{entry.level}
      </span>

      <span className="w-24 shrink-0 text-right font-metric-sm text-metric-sm text-primary">
        {entry.xp}
      </span>
    </div>
  );
}
