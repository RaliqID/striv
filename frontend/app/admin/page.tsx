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
import { useEffect, useState } from "react";

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
  const max = Math.max(...series.map((point) => point.count), 1);

  return (
    <div className="flex h-48 items-end gap-1 border-b border-outline-variant pb-1" role="img"
      aria-label={`Signups over the last ${series.length} days`}>
      {series.map((point) => (
        <div
          key={point.date}
          className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${point.date}: ${point.count} signups`}
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
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await apiClient.get<AdminStats>("/admin/stats"));
      setDenied(false);
    } catch (caught) {
      const { kind, message } = classifyError(caught);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <AdminLayout
      title="Overview"
      description="Platform activity and account health."
      actions={
        <>
          <Link
            href="/admin/users"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 font-metric-sm text-metric-sm text-on-primary hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              group
            </span>
            Manage users
          </Link>
          <Link
            href="/admin/security"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant px-5 py-3 font-metric-sm text-metric-sm text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              shield
            </span>
            Security
          </Link>
        </>
      }
    >
      {denied && (
        <ErrorBanner message="This area is available to administrators only." onRetry={load} />
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
              label="Total users"
              value={formatNumber(stats.total_users)}
              detail={`+${formatNumber(stats.new_users_7d)} in 7 days`}
              icon="group"
            />
            <StatCard
              label="Active users"
              value={formatNumber(stats.active_users_30d)}
              detail="Active in 30 days"
              icon="person_check"
            />
            <StatCard
              label="Workouts"
              value={formatNumber(stats.workouts_30d)}
              detail={`${formatNumber(stats.total_workouts)} all time`}
              icon="fitness_center"
            />
            <StatCard
              label="Volume lifted"
              value={formatVolume(stats.volume_30d_kg)}
              detail={`${formatNumber(stats.total_sets)} total sets`}
              icon="monitoring"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Panel
              title="Signups"
              description="Last 30 days"
              action={
                <Badge tone="success">+{formatNumber(stats.new_users_7d)} this week</Badge>
              }
            >
              {stats.signups_series.length ? (
                <SignupsChart series={stats.signups_series} />
              ) : (
                <EmptyState icon="bar_chart" title="No signup data available." />
              )}
            </Panel>

            <Panel title="Top exercises" description="Most logged movements">
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
                <EmptyState icon="fitness_center" title="No exercise data available." />
              )}
            </Panel>
          </div>

          <Panel title="Activity summary" description="Engagement and account state">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">Chat messages</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.chat_messages_30d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">Last 30 days</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">Image messages</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.ai_image_messages_30d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">AI coach uploads</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">Suspended</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.suspended_users)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">Current total</p>
              </div>
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">New this week</p>
                <p className="mt-1 font-headline-lg text-headline-lg text-primary">
                  {formatNumber(stats.new_users_7d)}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">Last 7 days</p>
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
