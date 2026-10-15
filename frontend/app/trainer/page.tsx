"use client";

import TrainerLayout from "@/components/trainer/TrainerLayout";
import { useToast } from "@/components/admin/Toast";
import { apiClient, ApiError } from "@/lib/api";
import type { TrainerDashboard } from "@/lib/training";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Trainer home.
 *
 * Answers the two questions a trainer opens the panel with: "who am I coaching"
 * and "is anyone training right now". The live strip is polled while the page
 * is open â€” a socket would be more immediate, but this data changes on the
 * scale of minutes, not milliseconds, and polling survives a device sleeping.
 */
export default function TrainerDashboardPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<TrainerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingAvailability, setTogglingAvailability] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await apiClient.get<TrainerDashboard>("/trainer/dashboard");
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setError(t("panel.errNoAccess"));
        return;
      }
      // A silent poll failure must not replace the screen with an error â€”
      // the next poll will likely succeed.
      if (!silent) {
        setError(err instanceof ApiError ? err.message : t("panel.errLoad"));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    // Live strip refreshes every 20s; fast enough to feel current, slow enough
    // not to hammer the API from a tab left open all day.
    const timer = setInterval(() => load(true), 20000);
    return () => clearInterval(timer);
  }, [load]);

  const toggleAvailability = async () => {
    if (!data) return;
    setTogglingAvailability(true);
    try {
      const res = await apiClient.post<{ is_available: boolean; message: string }>(
        "/trainer/availability",
        { is_available: !data.trainer.is_available }
      );
      setData({ ...data, trainer: { ...data.trainer, is_available: res.is_available } });
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setTogglingAvailability(false);
    }
  };

  if (loading) {
    return (
      <TrainerLayout title={t("panel.statClients")}>
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
            progress_activity
          </span>
        </div>
      </TrainerLayout>
    );
  }

  if (error && !data) {
    return (
      <TrainerLayout title={t("panel.statClients")}>
        <div className="rounded-lg bg-error-container p-4 text-sm text-on-error-container" role="alert">
          {error}
        </div>
      </TrainerLayout>
    );
  }

  if (!data) return null;

  const { trainer, stats, clients, live } = data;

  return (
    <TrainerLayout
        title={t("panel.yourClients")}
        description={t("panel.slotsUsed", { used: stats.clients, total: stats.capacity })}
      actions={
        <button
          type="button"
          onClick={toggleAvailability}
          disabled={togglingAvailability}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 font-metric-sm text-metric-sm transition-colors disabled:opacity-50 ${
            trainer.is_available
              ? "border border-outline-variant text-on-surface hover:bg-surface-container-low"
              : "bg-primary text-on-primary hover:bg-primary/90"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${trainer.is_available ? "bg-primary" : "bg-outline"}`}
          />
          {trainer.is_available ? t("panel.acceptingClients") : t("panel.notAccepting")}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label={t("panel.statClients")} value={String(stats.clients)} icon="group" />
          <StatCard label={t("panel.statFreeSlots")} value={String(stats.slots_free)} icon="event_available" />
          <StatCard
            label={t("panel.statAwaiting")}
            value={String(stats.awaiting_schedule)}
            icon="pending_actions"
            highlight={stats.awaiting_schedule > 0}
          />
          <StatCard
            label={t("panel.statTrainingNow")}
            value={String(stats.training_now)}
            icon="sensors"
            highlight={stats.training_now > 0}
          />
        </div>

        {/* Live strip â€” only rendered when it has something to say. */}
        {live.length > 0 && (
          <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <h2 className="font-metric-sm text-metric-sm text-on-surface">
                {t("panel.trainingRightNow")}
              </h2>
            </div>
            <ul className="space-y-2">
              {live.map((s) => (
                <li key={s.session_id}>
                  <Link
                    href={`/trainer/clients/${s.user_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-3 transition-colors hover:bg-surface-container-low"
                  >
                    <span className="font-body-md text-body-md text-on-surface">{s.user_name}</span>
                    <span className="font-body-md text-sm text-on-surface-variant">
                      {s.elapsed_minutes} min Â· {s.sets_logged} sets logged
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Client list */}
        <section>
          <h2 className="mb-3 font-metric-sm text-metric-sm text-on-surface">{t("panel.allClients")}</h2>

          {clients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant p-10 text-center">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant">
                person_add
              </span>
              <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                {t("panel.noClients")}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {clients.map((client) => (
                <li key={client.assignment_id}>
                  <Link
                    href={`/trainer/clients/${client.user_id}`}
                    className="block rounded-xl border border-outline-variant bg-surface-container-low p-5 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-metric-sm text-metric-sm text-on-surface">
                            {client.name}
                          </span>
                          {client.is_training_now && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-label-caps text-label-caps text-primary">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              {t("panel.live")}
                            </span>
                          )}
                          {!client.confirmed && (
                            <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-label-caps text-label-caps text-on-tertiary-container">
                              {t("panel.needsSchedule")}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 font-body-md text-sm text-on-surface-variant">
                          <span className="capitalize">{client.primary_goal ?? t("panel.noGoal")}</span>
                          <span className="capitalize">{client.experience_level ?? t("panel.unknown")}</span>
                          <span>{t("panel.workouts30d", { count: client.workouts_30d })}</span>
                          <span>
                            {client.schedule_days}{" "}
                            {client.schedule_days === 1 ? t("panel.day") : t("panel.days")}{" "}
                            {t("panel.scheduled")}
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-outline">chevron_right</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TrainerLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-primary bg-primary/5" : "border-outline-variant bg-surface-container-low"
      }`}
    >
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        <span className="font-label-caps text-label-caps">{label}</span>
      </div>
      <p className={`mt-2 font-headline-lg-mobile text-headline-lg-mobile ${highlight ? "text-primary" : "text-on-surface"}`}>
        {value}
      </p>
    </div>
  );
}
