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

const WINDOWS = [
  { value: 1, label: "Last 24 hours" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
];

export default function AdminSecurityPage() {
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
      const { kind, message } = classifyError(caught);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <AdminLayout
      title="Security"
      description="Sign-in attempts and rate-limit activity."
      actions={
        <label>
          <span className="sr-only">Time window</span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      {denied ? (
        <ErrorBanner message="This area is available to administrators only." />
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
                    Login throttling is active
                  </p>
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                    Each IP is limited to 20 attempts per minute, and each account to 5 attempts per
                    15 minutes per IP. Once an account is locked, even the correct password is
                    refused until the window passes.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Total attempts",
                      value: formatNumber(data.summary.total_attempts),
                      detail: `${formatNumber(data.summary.successful_attempts)} succeeded`,
                    },
                    {
                      label: "Failed attempts",
                      value: formatNumber(data.summary.failed_attempts),
                      detail: `${data.summary.failure_rate}% of all attempts`,
                    },
                    {
                      label: "Distinct sources",
                      value: formatNumber(data.summary.distinct_ips),
                      detail: `${formatNumber(data.summary.distinct_emails)} accounts targeted`,
                    },
                    {
                      label: "Locked accounts",
                      value: formatNumber(data.summary.locked_accounts),
                      detail: "Currently over the limit",
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
                    >
                      <p className="font-label-caps text-label-caps text-on-surface-variant">
                        {card.label}
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
                    title="Top offending IPs"
                    description="Addresses with the most failed sign-ins"
                    bodyClassName="p-0"
                  >
                    {data.top_offending_ips.length ? (
                      <ul className="divide-y divide-outline-variant">
                        {data.top_offending_ips.map((row) => (
                          <li key={row.ip_address} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <p className="font-mono text-[14px] text-on-surface">{row.ip_address}</p>
                              <p className="font-body-md text-body-md text-on-surface-variant">
                                {formatNumber(row.distinct_emails)} account
                                {row.distinct_emails === 1 ? "" : "s"} targeted ·{" "}
                                {formatRelative(row.last_seen_at)}
                              </p>
                            </div>
                            <Badge tone={row.failures >= 20 ? "danger" : "warning"}>
                              {formatNumber(row.failures)} fails
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-5">
                        <EmptyState icon="verified_user" title="No failed sign-ins in this window." />
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="Top targeted accounts"
                    description="Accounts absorbing the most failures"
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
                                From {formatNumber(row.distinct_ips)} address
                                {row.distinct_ips === 1 ? "" : "es"} · {formatRelative(row.last_seen_at)}
                              </p>
                            </div>
                            <Badge tone={row.distinct_ips > 3 ? "danger" : "warning"}>
                              {formatNumber(row.failures)} fails
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-5">
                        <EmptyState icon="verified_user" title="No targeted accounts in this window." />
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel
                  title="Recent attempts"
                  description="Most recent 50 sign-in attempts, newest first"
                  bodyClassName="p-0"
                >
                  {data.recent_attempts.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[40rem] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-outline-variant">
                            {["When", "Account", "IP address", "Result"].map((header) => (
                              <th
                                key={header}
                                scope="col"
                                className="px-4 py-3 font-label-caps text-label-caps text-on-surface-variant"
                              >
                                {header}
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
                                {formatDateTime(attempt.created_at)}
                              </td>
                              <td className="px-4 py-3 font-body-md text-body-md text-on-surface">
                                {attempt.email || "—"}
                              </td>
                              <td className="px-4 py-3 font-mono text-[13px] text-on-surface-variant">
                                {attempt.ip_address}
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={attempt.successful ? "success" : "danger"}>
                                  {attempt.successful ? "Success" : "Failed"}
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
                        title="No sign-in attempts recorded."
                        description="Attempts will appear here as members sign in."
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
