"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import Button from "@/components/admin/Button";
import Pagination from "@/components/admin/Pagination";
import Panel from "@/components/admin/Panel";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { apiClient } from "@/lib/api";
import {
  classifyError,
  formatDateTime,
  humanizeAction,
  redirectToLogin,
} from "@/lib/admin";
import type { AdminAuditLogsResponse } from "@/types/admin";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

/** Colour destructive verbs differently from restorative ones at a glance. */
function toneFor(action: string): "danger" | "success" | "primary" | "warning" | "neutral" {
  if (action.endsWith("deleted") || action.endsWith("suspended")) return "danger";
  if (action.endsWith("unsuspended") || action.endsWith("admin_granted")) return "success";
  if (action.endsWith("password_reset")) return "warning";
  if (action.endsWith("updated")) return "primary";
  return "neutral";
}

export default function AdminAuditPage() {
  const { t, locale } = useTranslation();
  const [result, setResult] = useState<AdminAuditLogsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(
    async (next: { page?: number; search?: string; action?: string } = {}) => {
      const query = {
        page: next.page ?? page,
        search: next.search ?? search,
        action: next.action ?? action,
      };

      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          search: query.search,
          action: query.action,
          page: String(query.page),
          per_page: "25",
        });
        setResult(await apiClient.get<AdminAuditLogsResponse>(`/admin/audit-logs?${params}`));
        setPage(query.page);
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
    [page, search, action, t]
  );

  useEffect(() => {
    void load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtersActive = search.trim() !== "" || action !== "all";

  return (
    <AdminLayout
      title={t("admin.auditLog")}
      description={t("admin.auditDesc")}
    >
      {denied ? (
        <ErrorBanner message={t("admin.adminsOnly")} />
      ) : (
        <>
          <Panel bodyClassName="p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load({ page: 1 });
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t("admin.srSearchAudit")}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("admin.searchAudit")}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                />
              </label>
              <label>
                <span className="sr-only">{t("admin.srFilterAction")}</span>
                <select
                  value={action}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAction(value);
                    void load({ action: value, page: 1 });
                  }}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none sm:w-auto"
                >
                  <option value="all">{t("admin.allActions")}</option>
                  {(result?.actions ?? []).map((option) => (
                    <option key={option} value={option}>
                      {humanizeAction(option)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" icon="search" disabled={loading}>
                {t("action.search")}
              </Button>
              {filtersActive && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setAction("all");
                    void load({ search: "", action: "all", page: 1 });
                  }}
                >
                  {t("action.clear")}
                </Button>
              )}
            </form>
          </Panel>

          {error && <ErrorBanner message={error} onRetry={() => void load()} />}

          <Panel bodyClassName="p-0">
            {loading && !result ? (
              <div className="p-5">
                <LoadingRows rows={6} />
              </div>
            ) : result && result.data.length ? (
              <>
                <ul className="divide-y divide-outline-variant">
                  {result.data.map((log) => (
                    <li key={log.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={toneFor(log.action)}>{humanizeAction(log.action)}</Badge>
                          <span className="font-metric-sm text-metric-sm text-on-surface">
                            {log.actor_name}
                          </span>
                          {log.target_label && (
                            <>
                              <span className="font-body-md text-body-md text-on-surface-variant">
                                →
                              </span>
                              {log.target_user_id ? (
                                <Link
                                  href={`/admin/users/${log.target_user_id}`}
                                  className="font-body-md text-body-md text-primary hover:underline"
                                >
                                  {log.target_label}
                                </Link>
                              ) : (
                                <span className="font-body-md text-body-md text-on-surface-variant">
                                  {log.target_label}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {/* Extra context captured with the action, e.g. which fields changed. */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <p className="mt-1 break-words font-mono text-[12px] text-on-surface-variant">
                            {JSON.stringify(log.metadata)}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="whitespace-nowrap font-body-md text-body-md text-on-surface-variant">
                          {formatDateTime(log.created_at, locale)}
                        </p>
                        {log.ip_address && (
                          <p className="font-mono text-[12px] text-on-surface-variant">
                            {log.ip_address}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {result.meta.total > 0 && (
                  <Pagination meta={result.meta} onPage={(next) => void load({ page: next })} busy={loading} />
                )}
              </>
            ) : (
              <EmptyState
                icon="history_edu"
                title={filtersActive ? t("admin.auditEmptyFiltered") : t("admin.auditEmptyTitle")}
                description={
                  filtersActive
                    ? t("admin.emptyFilteredBody")
                    : t("admin.auditEmptyBody")
                }
                action={
                  filtersActive ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch("");
                        setAction("all");
                        void load({ search: "", action: "all", page: 1 });
                      }}
                    >
                      {t("admin.clearFilters")}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Panel>
        </>
      )}
    </AdminLayout>
  );
}
