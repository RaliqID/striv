"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import Panel from "@/components/admin/Panel";
import { apiClient } from "@/lib/api";
import {
  classifyError,
  formatNumber,
  formatVolume,
  redirectToLogin,
} from "@/lib/admin";
import type { AdminStats } from "@/types/admin";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-4 break-words font-headline-lg text-headline-lg text-primary">{value}</p>
      {detail && <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{detail}</p>}
    </div>
  );
}

/** Signup bars. Sized to the window max, not the row count, so one spike does not flatten the rest. */
function SignupsChart({ series }: { series: Array<{ date: string; count: number }> }) {
  const { t } = useTranslation();
  const max = Math.max(...series.map((point) => point.count), 1);

  return (
    <div className="flex h-48 items-end gap-1 border-b border-outline-variant pb-1" role="img"
      aria-label={t("admin.signupsChartAria", { count: series.length })}>
      {series.map((point) => (
        <div
          key={point.date}
          className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={t("admin.signupsPointTitle", { date: point.date, count: point.count })}
        >
          <div
            className="w-full max-w-5 rounded-t bg-secondary transition-all group-hover:bg-primary"
            style={{ height: `${Math.max((point.count / max) * 100, 4)}%` }}
          />
          <span className="sr-only">
            {point.date}: {point.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  /*
   * Wrapped in useCallback so the effect below can depend on it safely.
   *
   * It was a plain `const load = async () => {...}`, which meant every render
   * created a NEW function. Listing it as an effect dependency would therefore
   * re-run the effect on every render — and since the effect's body calls
   * setLoading/setError/setStats, each run triggers another render. That is a
   * real infinite loop, not a theoretical one: it was measured at 52 requests to
   * /admin/stats in 15 seconds before the change.
   *
   * `t` is included because the catch block builds a message from it. `t` is
   * itself a useCallback keyed on locale, so it is stable until the language
   * changes — at which point re-creating this callback and re-running the effect
   * is correct, because the error string should follow the member's language.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await apiClient.get<AdminStats>("/admin/stats"));
      setDenied(false);
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminLayout
      title={t("admin.overview")}
      description={t("admin.overviewDesc")}
      actions={
        <>
          <Link
            href="/admin/users"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 font-metric-sm text-metric-sm text-on-primary hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              group
            </span>
            {t("admin.manageUsers")}
          </Link>
          <Link
            href="/admin/security"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant px-5 py-3 font-metric-sm text-metric-sm text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              shield
            </span>
            {t("admin.security")}
          </Link>
        </>
      }
    >
      {denied && (
        <ErrorBanner message={t("admin.adminsOnly")} onRetry={load} />
      )}
      {error && !denied && <ErrorBanner message={error} onRetry={load} />}

      {loading && !stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      )}

      {stats && !denied && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("admin.totalUsers")}
              value={formatNumber(stats.total_users)}
              detail={t("admin.newIn7d", { count: formatNumber(stats.new_users_7d) })}
              icon="group"
            />
            <StatCard
              label={t("admin.activeUsers")}
              value={formatNumber(stats.active_users_30d)}
              detail={t("admin.activeIn30")}
              icon="person_check"
            />
            <StatCard
              label={t("dashboard.statWorkouts")}
              value={formatNumber(stats.workouts_30d)}
              detail={t("admin.allTimeCount", { count: formatNumber(stats.total_workouts) })}
              icon="fitness_center"
            />
            <StatCard
              label={t("admin.volumeLifted")}
              value={formatVolume(stats.volume_30d_kg)}
              detail={t("admin.totalSetsCount", { count: formatNumber(stats.total_sets) })}
              icon="monitoring"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Panel
              title={t("admin.signups")}
              description={t("admin.last30")}
              action={
                <Badge tone="success">{t("admin.plusThisWeek", { count: formatNumber(stats.new_users_7d) })}</Badge>
              }
            >
              {stats.signups_series.length ? (
                <SignupsChart series={stats.signups_series} />
              ) : (
                <EmptyState icon="bar_chart" title={t("admin.noSignupData")} />
              )}
            </Panel>

            <Panel title={t("admin.topExercises")} description={t("admin.mostLogged")}>
              {stats.top_exercises.length ? (
                <ol className="space-y-3">
                  {stats.top_exercises.slice(0, 6).map((exercise, index) => (
                    <li key={exercise.name} className="flex items-center gap-3">
                      <span className="w-5 font-label-caps text-label-caps text-on-surface-variant">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-body-md text-body-md text-on-surface">
                        {exercise.name}
                      </span>
                      <span className="font-metric-sm text-metric-sm text-primary">
                        {formatNumber(exercise.uses)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon="fitness_center" title={t("admin.noExerciseData")} />
              )}
            </Panel>
          </div>

          <Panel title={t("admin.activitySummary")} description={t("admin.engagementState")}>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.chatMessages")}</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.chat_messages_30d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">{t("admin.last30")}</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.imageMessages")}</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.ai_image_messages_30d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">{t("admin.aiUploads")}</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.suspendedLabel")}</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.suspended_users)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">{t("admin.currentTotal")}</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.newThisWeek")}</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.new_users_7d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">{t("admin.last7days")}</p>
              </div>
            </div>
          </Panel>
        </>
      )}

      {!loading && !stats && !denied && !error && (
        <LoadingRows rows={2} />
      )}
    </AdminLayout>
  );
}
