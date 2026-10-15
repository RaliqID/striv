"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import Panel from "@/components/admin/Panel";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { apiClient } from "@/lib/api";
import {
  classifyError,
  formatDateTime,
  formatNumber,
  formatRelative,
  redirectToLogin,
} from "@/lib/admin";
import type { AdminSecurityResponse } from "@/types/admin";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const WINDOWS = [
  { value: 1, labelKey: "admin.last24h" },
  { value: 7, labelKey: "admin.last7d" },
  { value: 30, labelKey: "admin.lastDays" },
];

export default function AdminSecurityPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<AdminSecurityResponse | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (window = days) => {
    setLoading(true);
    setError("");
    try {
      setData(await apiClient.get<AdminSecurityResponse>(`/admin/security?days=${window}`));
      setDenied(false);
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [days, t]);

  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <AdminLayout
      title={t("admin.security")}
      description={t("admin.securityDesc")}
      actions={
        <label>
          <span className="sr-only">{t("admin.srTimeWindow")}</span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {denied ? (
        <ErrorBanner message={t("admin.adminsOnly")} />
      ) : (
        <>
          {error && <ErrorBanner message={error} onRetry={() => void load()} />}

          {loading && !data ? (
            <LoadingRows rows={4} />
          ) : (
            data && (
              <>
                {/* How throttling works — stated once so the numbers are readable */}
                <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                  <p className="font-metric-sm text-metric-sm text-on-surface">
                    {t("admin.throttleActive")}
                  </p>
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                    {t("admin.throttleBody")}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      labelKey: "admin.totalAttempts",
                      value: formatNumber(data.summary.total_attempts),
                      detail: t("admin.succeeded", {
                        count: formatNumber(data.summary.successful_attempts),
                      }),
                    },
                    {
                      labelKey: "admin.failedAttempts",
                      value: formatNumber(data.summary.failed_attempts),
                      detail: t("admin.ofAllAttempts", { rate: data.summary.failure_rate }),
                    },
                    {
                      labelKey: "admin.distinctSources",
                      value: formatNumber(data.summary.distinct_ips),
                      detail: t("admin.accountsTargeted", {
                        count: formatNumber(data.summary.distinct_emails),
                      }),
                    },
                    {
                      labelKey: "admin.lockedAccounts",
                      value: formatNumber(data.summary.locked_accounts),
                      detail: t("admin.overLimit"),
                    },
                  ].map((card) => (
                    <div
                      key={card.labelKey}
                      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
                    >
                      <p className="font-label-caps text-label-caps text-on-surface-variant">
                        {t(card.labelKey)}
                      </p>
                      <p className="mt-2 break-words font-headline-lg text-headline-lg text-primary">
                        {card.value}
                      </p>
                      <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                        {card.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel
                    title={t("admin.topIps")}
                    description={t("admin.topIpsDesc")}
                    bodyClassName="p-0"
                  >
                    {data.top_offending_ips.length ? (
                      <ul className="divide-y divide-outline-variant">
                        {data.top_offending_ips.map((row) => (
                          <li key={row.ip_address} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <p className="font-mono text-[14px] text-on-surface">{row.ip_address}</p>
                              <p className="font-body-md text-body-md text-on-surface-variant">
                                {t("admin.accountsTargetedShort", { count: formatNumber(row.distinct_emails) })} ·{" "}
                                {formatRelative(row.last_seen_at, t, locale)}
                              </p>
                            </div>
                            <Badge tone={row.failures >= 20 ? "danger" : "warning"}>
                              {t("admin.fails", { count: formatNumber(row.failures) })}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-5">
                        <EmptyState icon="verified_user" title={t("admin.noFailedSignins")} />
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title={t("admin.topAccounts")}
                    description={t("admin.topAccountsDesc")}
                    bodyClassName="p-0"
                  >
                    {data.top_targeted_accounts.length ? (
                      <ul className="divide-y divide-outline-variant">
                        {data.top_targeted_accounts.map((row) => (
                          <li key={row.email} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <p className="truncate font-body-md text-body-md text-on-surface">
                                {row.email}
                              </p>
                              <p className="font-body-md text-body-md text-on-surface-variant">
                                {t("admin.fromAddresses", { count: formatNumber(row.distinct_ips) })} · {formatRelative(row.last_seen_at, t, locale)}
                              </p>
                            </div>
                            <Badge tone={row.distinct_ips > 3 ? "danger" : "warning"}>
                              {t("admin.fails", { count: formatNumber(row.failures) })}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-5">
                        <EmptyState icon="verified_user" title={t("admin.noTargeted")} />
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel
                  title={t("admin.recentAttempts")}
                  description={t("admin.recentAttemptsDesc")}
                  bodyClassName="p-0"
                >
                  {data.recent_attempts.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[40rem] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-outline-variant">
                            {["admin.colWhen", "admin.colAccount", "admin.colIp", "admin.colResult"].map((headerKey) => (
                              <th
                                key={headerKey}
                                scope="col"
                                className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant"
                              >
                                {t(headerKey)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent_attempts.map((attempt) => (
                            <tr
                              key={attempt.id}
                              className="border-b border-outline-variant/60 last:border-0 hover:bg-surface-container-low"
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-body-md text-body-md text-on-surface-variant">
                                {formatDateTime(attempt.created_at, locale)}
                              </td>
                              <td className="px-4 py-3 font-body-md text-body-md text-on-surface">
                                {attempt.email || "—"}
                              </td>
                              <td className="px-4 py-3 font-mono text-[13px] text-on-surface-variant">
                                {attempt.ip_address}
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={attempt.successful ? "success" : "danger"}>
                                  {attempt.successful ? t("admin.success") : t("admin.failed")}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5">
                      <EmptyState
                        icon="shield"
                        title={t("admin.noAttempts")}
                        description={t("admin.noAttemptsDesc")}
                      />
                    </div>
                  )}
                </Panel>
              </>
            )
          )}
        </>
      )}
    </AdminLayout>
  );
}
