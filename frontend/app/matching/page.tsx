"use client";

import { apiClient, ApiError } from "@/lib/api";
import type { MemberOverview } from "@/lib/training";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from "react";

/**
 * Where a member lands straight after onboarding.
 *
 * Reaching this page means the member has a goal and the system is looking for
 * a trainer. Three outcomes are possible and all three are surfaced honestly:
 *
 *   matched   → a trainer is assigned, we can move on immediately
 *   unmatched → nobody free right now; the member can see that plainly
 *               rather than being shown a spinner forever
 *
 * Polling is used rather than a socket because matching is a sub-second
 * operation on the server; a member will almost always see this resolve on the
 * first or second poll.
 */
export default function MatchingPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<MemberOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<MemberOverview>("/my-trainer");
      setOverview(data);
      setError(null);
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return null;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Poll while unmatched; stop the moment a trainer appears.
  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const tick = async () => {
      const data = await load();
      if (cancelled) return;

      // Once matched there is nothing left to wait for.
      if (data?.trainer) return;

      setAttempts((a) => a + 1);
      timer = setTimeout(tick, 5000);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const retryMatch = async () => {
    if (requesting) return;
    setRequesting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ overview: MemberOverview; message: string }>(
        "/my-trainer/request",
        {}
      );
      setOverview(res.overview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined animate-spin text-[40px] text-primary">
            progress_activity
          </span>
          <p className="font-body-md text-on-surface-variant">{t("matching.checking")}</p>
        </div>
      </div>
    );
  }

  const matched = overview?.trainer != null;

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-margin-mobile py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <div className="font-headline-lg text-headline-lg font-black text-primary tracking-tighter mb-6">
            Striv
          </div>

          {matched ? (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <span className="material-symbols-outlined text-[32px] text-primary">handshake</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
                {t("matching.ready")}
              </h1>
              <p className="font-body-md text-on-surface-variant">
                {overview?.trainer?.name} {t("matching.assignedTo")}
              </p>
            </>
          ) : (
            <>
              {/* Animated indicator: the member should see that work is happening,
                  but not be promised a duration we cannot know. */}
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container">
                <span className="material-symbols-outlined animate-spin text-[32px] text-on-secondary-container">
                  progress_activity
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
                {t("matching.finding")}
              </h1>
              <p className="font-body-md text-on-surface-variant">
                {t("matching.findingBody")}
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-error-container p-4 text-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}

        {/* Why a trainer, not just an algorithm. This screen is the first place
            the product explains the value the member just signed up for. */}
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-6">
          <h2 className="font-metric-sm text-metric-sm text-on-surface mb-4">
            {t("matching.whatTrainerDoes")}
          </h2>
          <ul className="space-y-3">
            {[
              { icon: "event_available", text: t("matching.does1") },
              { icon: "assignment", text: t("matching.does2") },
              { icon: "visibility", text: t("matching.does3") },
              { icon: "trending_up", text: t("matching.does4") },
            ].map((row) => (
              <li key={row.icon} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mt-0.5">
                  {row.icon}
                </span>
                <span className="font-body-md text-body-md text-on-surface-variant">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {matched ? (
          <div className="flex flex-col gap-3">
            <Link
              href="/my-trainer"
              className="block w-full bg-primary text-on-primary font-metric-sm text-metric-sm py-4 rounded-xl text-center hover:bg-primary/90 transition-colors"
            >
              {t("matching.meetTrainer")}
            </Link>
            <Link
              href="/dashboard"
              className="block w-full border border-outline-variant text-on-surface font-metric-sm text-metric-sm py-4 rounded-xl text-center hover:bg-surface-container-low transition-colors"
            >
              {t("matching.goDashboard")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
              <p className="font-body-md text-sm text-on-surface-variant">
                {attempts > 3
                  ? t("matching.allBusy")
                  : t("matching.usuallyFast")}
              </p>
            </div>
            {attempts > 3 && (
              <button
                type="button"
                onClick={retryMatch}
                disabled={requesting}
                className="w-full border border-primary text-primary font-metric-sm text-metric-sm py-4 rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {requesting ? t("action.checking") : t("action.checkAgain")}
              </button>
            )}
            <Link
              href="/dashboard"
              className="block w-full text-center font-metric-sm text-metric-sm text-on-surface-variant py-3 hover:text-on-surface transition-colors"
            >
              {t("matching.continueWithout")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
