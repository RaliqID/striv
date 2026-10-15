"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import { useToast } from "@/components/admin/Toast";
import { apiClient, ApiError } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * Admin view of the training system.
 *
 * Matching runs automatically, so this page is not a to-do list — it is an
 * exception console. The pending queue should normally be empty; when it is
 * not, capacity has run out and the fix is visible right here (add a trainer,
 * or free one up and re-run the sweep).
 */

interface TrainerRow {
  id: number;
  name: string;
  email: string;
  specialization: string | null;
  capacity: number;
  active_clients: number;
  slots_free: number;
  is_available: boolean;
  is_suspended: boolean;
  rating: number | null;
}

interface TrainingStats {
  trainers_total: number;
  trainers_available: number;
  clients_active: number;
  capacity_total: number;
  pending_requests: number;
  awaiting_schedule: number;
}

interface PendingRequest {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  goal_type: string | null;
  notes: string | null;
  created_at: string | null;
  waiting_minutes: number | null;
}

export default function AdminTrainingPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        apiClient.get<{ trainers: TrainerRow[]; stats: TrainingStats }>("/admin/training/trainers"),
        apiClient.get<{ requests: PendingRequest[] }>("/admin/training/pending"),
      ]);
      setTrainers(t.trainers);
      setStats(t.stats);
      setPending(p.requests);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const rematch = async () => {
    setRematching(true);
    try {
      const res = await apiClient.post<{ matched: number; rematched_orphans: number; message: string }>(
        "/admin/training/rematch",
        {}
      );
      toast.success(res.message);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("admin.rematchFailed"));
    } finally {
      setRematching(false);
    }
  };

  const assignTo = async (requestId: number, trainerId: number) => {
    setAssigning(requestId);
    try {
      await apiClient.post(`/admin/training/requests/${requestId}/assign`, {
        trainer_id: trainerId,
      });
      toast.success(t("toast.trainerAssigned"));
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setAssigning(null);
    }
  };

  return (
    <AdminLayout
      title={t("admin.training")}
      description={t("admin.trainingDesc")}
      actions={
        <button
          type="button"
          onClick={rematch}
          disabled={rematching}
          className="rounded-lg bg-primary px-4 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {rematching ? t("admin.running") : t("admin.runSweep")}
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
            progress_activity
          </span>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-error-container p-4 text-sm text-on-error-container" role="alert">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("admin.statTrainers")} value={String(stats.trainers_total)} />
              <Stat label={t("admin.statAvailable")} value={String(stats.trainers_available)} />
              <Stat label={t("admin.statActiveClients")} value={String(stats.clients_active)} />
              <Stat label={t("admin.statTotalCapacity")} value={String(stats.capacity_total)} />
              <Stat
                label={t("admin.statWaiting")}
                value={String(stats.pending_requests)}
                highlight={stats.pending_requests > 0}
              />
              <Stat
                label={t("admin.statNoSchedule")}
                value={String(stats.awaiting_schedule)}
                highlight={stats.awaiting_schedule > 0}
              />
            </div>
          )}

          {/* Pending queue only renders when it has entries — an empty queue is
              the healthy state and does not deserve screen space. */}
          {pending.length > 0 && (
            <section className="rounded-xl border border-tertiary bg-tertiary-container/30 p-5">
              <h2 className="mb-1 font-metric-sm text-metric-sm text-on-surface">
                {t("admin.waitingForTrainer")}
              </h2>
              <p className="mb-4 font-body-md text-sm text-on-surface-variant">
                {t("admin.waitingHint")}
              </p>
              <ul className="space-y-2">
                {pending.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-body-md text-body-md text-on-surface">{r.user_name}</p>
                      <p className="font-body-md text-sm text-on-surface-variant">
                        {r.user_email} · {t("admin.goalLabel")}: {r.goal_type ?? t("admin.notSet")} ·{" "}
                        {r.waiting_minutes !== null ? `${r.waiting_minutes} ${t("admin.minWaiting")}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        disabled={assigning === r.id}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (id) assignTo(r.id, id);
                        }}
                        className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
                      >
                        <option value="">{t("admin.assignManually")}</option>
                        {trainers
                          .filter((trainer) => !trainer.is_suspended)
                          .map((trainer) => (
                            <option key={trainer.id} value={trainer.id}>
                              {trainer.name} ({trainer.active_clients}/{trainer.capacity})
                            </option>
                          ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Trainer roster */}
          <section>
            <h2 className="mb-3 font-metric-sm text-metric-sm text-on-surface">{t("admin.trainerRoster")}</h2>
            {trainers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant p-10 text-center">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t("admin.noTrainers")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-outline-variant">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="bg-surface-container-low">
                    <tr className="font-label-caps text-label-caps text-on-surface-variant">
                      <th className="px-4 py-3">{t("admin.colTrainer")}</th>
                      <th className="px-4 py-3">{t("admin.colSpecialisation")}</th>
                      <th className="px-4 py-3">{t("admin.colLoad")}</th>
                      <th className="px-4 py-3">{t("admin.colRating")}</th>
                      <th className="px-4 py-3">{t("admin.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {trainers.map((trainer) => {
                      const pct = trainer.capacity > 0 ? (trainer.active_clients / trainer.capacity) * 100 : 0;
                      return (
                        <tr key={trainer.id} className="bg-surface-container-lowest">
                          <td className="px-4 py-3">
                            <p className="font-body-md text-body-md text-on-surface">{trainer.name}</p>
                            <p className="font-body-md text-sm text-on-surface-variant">{trainer.email}</p>
                          </td>
                          <td className="px-4 py-3 font-body-md text-body-md text-on-surface-variant capitalize">
                            {trainer.specialization ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-body-md text-body-md text-on-surface">
                                {trainer.active_clients}/{trainer.capacity}
                              </span>
                              {/* A quick read of how close this trainer is to
                                  full — orange means they are nearly closed. */}
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-outline-variant">
                                <span
                                  className={`block h-full ${
                                    pct >= 90 ? "bg-error" : pct >= 60 ? "bg-tertiary" : "bg-primary"
                                  }`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-body-md text-body-md text-on-surface">
                            {trainer.rating !== null ? trainer.rating.toFixed(1) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {trainer.is_suspended ? (
                              <Badge tone="error">{t("admin.statusSuspended")}</Badge>
                            ) : !trainer.is_available ? (
                              <Badge tone="neutral">{t("admin.statusNotAccepting")}</Badge>
                            ) : trainer.slots_free === 0 ? (
                              <Badge tone="warn">{t("admin.statusFull")}</Badge>
                            ) : (
                              <Badge tone="ok">{t("admin.slotsFree", { count: trainer.slots_free })}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-tertiary bg-tertiary-container/30" : "border-outline-variant bg-surface-container-low"
      }`}
    >
      <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "error" | "neutral";
}) {
  const classes = {
    ok: "bg-primary/10 text-primary",
    warn: "bg-tertiary-container text-on-tertiary-container",
    error: "bg-error-container text-on-error-container",
    neutral: "bg-surface-container-high text-on-surface-variant",
  }[tone];

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 font-label-caps text-label-caps ${classes}`}>
      {children}
    </span>
  );
}
