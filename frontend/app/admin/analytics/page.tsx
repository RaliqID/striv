"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import Panel from "@/components/admin/Panel";
import TrendChart, { type TrendSeries } from "@/components/admin/TrendChart";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { apiClient, apiUrl } from "@/lib/api";
import { classifyError, formatNumber, formatRelative, redirectToLogin } from "@/lib/admin";
import { useToast } from "@/components/admin/Toast";
import { useTranslation } from "@/lib/i18n/provider";
import type {
  AdminAnalyticsResponse,
  AnalyticsKpiKey,
  AnalyticsRange,
  AnalyticsSeriesKey,
} from "@/types/admin";
import { useCallback, useEffect, useMemo, useState } from "react";

const RANGES: Array<{ value: AnalyticsRange; labelKey: string }> = [
  { value: "daily", labelKey: "admin.rangeDaily" },
  { value: "7d", labelKey: "admin.range7d" },
  { value: "30d", labelKey: "admin.range30d" },
  { value: "90d", labelKey: "admin.range90d" },
  { value: "1y", labelKey: "admin.range1y" },
];

/**
 * KPI tiles, in the order they are read: who joined, who is training, how much
 * work was done, then the softer engagement signals.
 */
const KPI_TILES: Array<{ key: AnalyticsKpiKey; labelKey: string; format: "int" | "kg" }> = [
  { key: "new_users", labelKey: "admin.kpiNewUsers", format: "int" },
  { key: "active_users", labelKey: "admin.kpiActiveUsers", format: "int" },
  { key: "workouts", labelKey: "admin.kpiWorkouts", format: "int" },
  { key: "sets", labelKey: "admin.kpiSets", format: "int" },
  { key: "volume_kg", labelKey: "admin.kpiVolume", format: "kg" },
  { key: "chat_messages", labelKey: "admin.kpiChat", format: "int" },
  { key: "certificates", labelKey: "admin.kpiCertificates", format: "int" },
  { key: "achievements", labelKey: "admin.kpiAchievements", format: "int" },
];

/**
 * Chart series. Two are on by default: one volume metric and one engagement
 * metric read well together, while all seven at once would be a smear.
 */
const SERIES: Array<{
  key: AnalyticsSeriesKey;
  labelKey: string;
  color: string;
  area?: boolean;
  defaultOn?: boolean;
}> = [
  { key: "workouts", labelKey: "admin.seriesWorkouts", color: "#1C1B1B", area: true, defaultOn: true },
  { key: "active_users", labelKey: "admin.seriesActiveUsers", color: "#4648D4", defaultOn: true },
  { key: "signups", labelKey: "admin.seriesSignups", color: "#0F766E" },
  { key: "sets", labelKey: "admin.seriesSets", color: "#B45309" },
  { key: "chat_messages", labelKey: "admin.seriesChat", color: "#7E22CE" },
  { key: "certificates", labelKey: "admin.seriesCertificates", color: "#15803D" },
  { key: "volume_kg", labelKey: "admin.seriesVolume", color: "#BE123C" },
];

/** Bucket keys arrive as `Y-m-d`, `Y-m-d H:00:00` or `Y-m`. */
function formatBucket(key: string, granularity: string, locale: string): string {
  try {
    if (granularity === "month") {
      const [year, month] = key.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString(locale, {
        month: "short",
        year: "2-digit",
      });
    }

    const date = new Date(granularity === "hour" ? key.replace(" ", "T") : `${key}T00:00:00`);
    if (Number.isNaN(date.getTime())) return key;

    if (granularity === "hour") {
      return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    }

    return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  } catch {
    return key;
  }
}

/**
 * Backend role values are `user`/`trainer`/`admin`; the catalogue keys the
 * member role as `member`, so the two do not line up by name.
 */
function roleLabelKey(role: string): string {
  return role === "user" ? "role.member" : `role.${role}`;
}

export default function AdminAnalyticsPage() {
  const { t, locale } = useTranslation();
  const { error: toastError } = useToast();
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [enabled, setEnabled] = useState<string[]>(
    SERIES.filter((s) => s.defaultOn).map((s) => s.key),
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(
    async (window: AnalyticsRange) => {
      setLoading(true);
      setError("");
      try {
        setData(await apiClient.get<AdminAnalyticsResponse>(`/admin/analytics?range=${window}`));
        setDenied(false);
      } catch (caught) {
        const { kind, message } = classifyError(caught, t);
        if (kind === "unauthorized") return redirectToLogin();
        if (kind === "forbidden") setDenied(true);
        else setError(message);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const chartSeries = useMemo<TrendSeries[]>(() => {
    if (!data) return [];

    return SERIES.filter((s) => enabled.includes(s.key)).map((s) => ({
      key: s.key,
      label: t(s.labelKey),
      values: data.series.metrics[s.key] ?? [],
      color: s.color,
      area: s.area && enabled.length === 1,
    }));
  }, [data, enabled, t]);

  const toggleSeries = (key: string) => {
    setEnabled((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  /**
   * The download needs the bearer token, which a plain link cannot send, so the
   * blob is fetched and opened locally - the same approach as the users export.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = window.localStorage.getItem("token");
      const response = await fetch(apiUrl(`/admin/analytics/export?range=${range}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `striv-analytics-${range}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toastError(t("admin.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const granularity = data?.granularity ?? "day";

  return (
    <AdminLayout
      title={t("admin.analytics")}
      description={t("admin.analyticsDesc")}
      actions={
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || loading || !data}
          className="rounded-lg border border-outline-variant px-4 py-2 font-metric-sm text-metric-sm text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
        >
          {exporting ? t("admin.exporting") : t("admin.exportCsv")}
        </button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            aria-pressed={range === option.value}
            className={`rounded-lg border px-3 py-1.5 font-label-caps text-label-caps transition-colors ${
              range === option.value
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      {denied ? (
        <ErrorBanner message={t("admin.adminsOnly")} />
      ) : (
        <>
          {error && <ErrorBanner message={error} onRetry={() => void load(range)} />}

          {loading && !data ? (
            <LoadingRows rows={6} />
          ) : data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {KPI_TILES.map((tile) => {
                  const kpi = data.kpis[tile.key];
                  if (!kpi) return null;

                  const delta = kpi.delta_pct;
                  const tone = delta === null ? "neutral" : delta > 0 ? "success" : delta < 0 ? "danger" : "neutral";

                  return (
                    <Panel key={tile.key}>
                      <p className="font-label-caps text-label-caps text-on-surface-variant">
                        {t(tile.labelKey)}
                      </p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <p className="font-headline-lg text-headline-lg text-on-surface">
                          {tile.format === "kg"
                            ? `${formatNumber(Math.round(kpi.value))} kg`
                            : formatNumber(kpi.value)}
                        </p>
                        <Badge tone={tone}>
                          {delta === null
                            ? t("admin.deltaNew")
                            : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
                        </Badge>
                      </div>
                      <p className="mt-1 font-label-caps text-label-caps text-on-surface-variant">
                        {t("admin.vsPrevious", { value: formatNumber(kpi.previous) })}
                      </p>
                    </Panel>
                  );
                })}
              </div>

              <div className="mt-5">
                <Panel
                  title={t("admin.trend")}
                  description={t("admin.trendDesc")}
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      {SERIES.map((option) => {
                        const on = enabled.includes(option.key);
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => toggleSeries(option.key)}
                            aria-pressed={on}
                            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-label-caps text-label-caps transition-colors ${
                              on
                                ? "border-outline-variant bg-surface-container text-on-surface"
                                : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                            }`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: on ? option.color : "#C4C7C7" }}
                              aria-hidden="true"
                            />
                            {t(option.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  }
                >
                  <TrendChart
                    labels={data.series.labels}
                    series={chartSeries}
                    formatX={(label) => formatBucket(label, granularity, locale)}
                    emptyLabel={t("admin.noTrendData")}
                    ariaLabel={t("admin.trend")}
                  />
                </Panel>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Panel title={t("admin.topExercises")} description={t("admin.mostLogged")}>
                  {data.breakdowns.top_exercises.length === 0 ? (
                    <EmptyState
                      icon="fitness_center"
                      title={t("admin.noExerciseData")}
                      description={t("admin.noExerciseDataDesc")}
                    />
                  ) : (
                    <ul className="space-y-3">
                      {data.breakdowns.top_exercises.map((row) => (
                        <li key={row.name} className="flex items-center justify-between gap-4">
                          <span className="truncate font-body-md text-body-md text-on-surface">
                            {row.name}
                          </span>
                          <span className="shrink-0 font-metric-sm text-metric-sm text-on-surface-variant">
                            {formatNumber(row.uses)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title={t("admin.topMembers")} description={t("admin.topMembersDesc")}>
                  {data.breakdowns.top_users.length === 0 ? (
                    <EmptyState
                      icon="group"
                      title={t("admin.noActivityData")}
                      description={t("admin.noActivityDataDesc")}
                    />
                  ) : (
                    <ul className="space-y-3">
                      {data.breakdowns.top_users.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-4">
                          <span className="truncate font-body-md text-body-md text-on-surface">
                            {row.name}
                          </span>
                          <span className="shrink-0 font-metric-sm text-metric-sm text-on-surface-variant">
                            {t("admin.workoutsAndVolume", {
                              workouts: formatNumber(row.workouts),
                              volume: formatNumber(Math.round(row.volume_kg)),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title={t("admin.roleMix")} description={t("admin.roleMixDesc")}>
                  <ul className="space-y-3">
                    {data.breakdowns.roles.map((row) => (
                      <li key={row.label} className="flex items-center justify-between gap-4">
                        <span className="font-body-md text-body-md text-on-surface">
                          {t(roleLabelKey(row.label))}
                        </span>
                        <span className="font-metric-sm text-metric-sm text-on-surface-variant">
                          {formatNumber(row.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title={t("admin.recentSignups")} description={t("admin.recentSignupsDesc")}>
                  {data.breakdowns.recent_signups.length === 0 ? (
                    <EmptyState
                      icon="person_add"
                      title={t("admin.noSignupData")}
                      description={t("admin.noSignupDataDesc")}
                    />
                  ) : (
                    <ul className="divide-y divide-outline-variant">
                      {data.breakdowns.recent_signups.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="truncate font-body-md text-body-md text-on-surface">
                              {row.name}
                            </p>
                            <p className="truncate font-label-caps text-label-caps text-on-surface-variant">
                              {row.email}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <Badge tone="neutral">{t(roleLabelKey(row.role))}</Badge>
                            <span className="font-label-caps text-label-caps text-on-surface-variant">
                              {formatRelative(row.created_at, t, locale)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              <p className="mt-5 font-label-caps text-label-caps text-on-surface-variant">
                {t("admin.generatedAt", { value: formatRelative(data.generated_at, t, locale) })}
              </p>
            </>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}
