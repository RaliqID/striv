"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import Button from "@/components/admin/Button";
import type { Column } from "@/components/admin/DataTable";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import Panel from "@/components/admin/Panel";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { apiClient, apiUrl } from "@/lib/api";
import {
  classifyError,
  formatNumber,
  formatRelative,
  redirectToLogin,
} from "@/lib/admin";
import type { AdminUser, AdminUsersResponse } from "@/types/admin";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const STATUS_OPTIONS = [
  { value: "all", labelKey: "admin.allUsers" },
  { value: "active", labelKey: "admin.filterActive30d" },
  { value: "new", labelKey: "admin.filterNew7d" },
  { value: "suspended", labelKey: "admin.suspendedLabel" },
  { value: "admin", labelKey: "admin.roleAdminPlural" },
];

export default function AdminUsersPage() {
  const { t, locale } = useTranslation();
  const [result, setResult] = useState<AdminUsersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  const load = useCallback(
    async (
      next: { page?: number; status?: string; search?: string; sort?: string; order?: "asc" | "desc" } = {}
    ) => {
      const query = {
        page: next.page ?? page,
        status: next.status ?? status,
        search: next.search ?? search,
        sort: next.sort ?? sort,
        order: next.order ?? order,
      };

      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          search: query.search,
          status: query.status,
          sort: query.sort,
          order: query.order,
          page: String(query.page),
          per_page: "20",
        });
        setResult(await apiClient.get<AdminUsersResponse>(`/admin/users?${params}`));
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
    [page, status, search, sort, order, t]
  );

  useEffect(() => {
    void load({ page: 1 });
    // Initial load only; later loads are driven by the controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = (key: string) => {
    const nextOrder = sort === key && order === "desc" ? "asc" : "desc";
    setSort(key);
    setOrder(nextOrder);
    void load({ sort: key, order: nextOrder, page: 1 });
  };

  /**
   * Export reuses the current filters, so the file matches what is on screen.
   * The download is authorised by the bearer token, which a plain link cannot
   * send — hence fetching the blob and opening it locally.
   */
  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ search, status });
      const token = window.localStorage.getItem("token");
      const response = await fetch(apiUrl(`/admin/users/export?${params}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        setError(t("admin.exportFailed"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `striv-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("admin.exportFailed"));
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      header: t("admin.userAccount"),
      sortKey: "name",
      render: (user) => (
        <div className="min-w-0">
          <Link
            href={`/admin/users/${user.id}`}
            className="font-metric-sm text-metric-sm text-primary hover:underline"
          >
            {user.name}
          </Link>
          <p className="truncate font-body-md text-body-md text-on-surface-variant">{user.email}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: t("admin.colStatus"),
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {/* Role is always shown, not only for admins: a trainer is a
              materially different account type and must be visible in a list. */}
          {user.role === "admin" && <Badge tone="primary">{t("role.admin")}</Badge>}
          {user.role === "trainer" && <Badge tone="warning">{t("role.trainer")}</Badge>}
          {user.is_suspended ? (
            <Badge tone="danger">{t("admin.statusSuspended")}</Badge>
          ) : (
            <Badge tone="success">{t("admin.statusActive")}</Badge>
          )}
          {user.must_change_password && <Badge tone="warning">{t("admin.resetPending")}</Badge>}
        </div>
      ),
    },
    {
      key: "workouts_30d",
      header: t("dashboard.statWorkouts"),
      sortKey: "workouts_30d",
      align: "right",
      render: (user) => formatNumber(user.workouts_30d),
    },
    {
      key: "chat_messages_30d",
      header: t("admin.chatMsgsShort"),
      align: "right",
      render: (user) => formatNumber(user.chat_messages_30d),
    },
    {
      key: "last_active_at",
      header: t("admin.lastActive"),
      sortKey: "last_active",
      render: (user) => (
        <span className="text-on-surface-variant">{formatRelative(user.last_active_at, t, locale)}</span>
      ),
    },
  ];

  const filtersActive = search.trim() !== "" || status !== "all";

  return (
    <AdminLayout
      title={t("admin.users")}
      description={t("admin.usersDesc")}
      actions={
        <Button variant="secondary" icon="download" onClick={exportCsv}>
          {t("admin.exportCsv")}
        </Button>
      }
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
                <span className="sr-only">{t("admin.srSearchUsers")}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("admin.searchUsers")}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                />
              </label>
              <label>
                <span className="sr-only">{t("admin.srFilterStatus")}</span>
                <select
                  value={status}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStatus(value);
                    void load({ status: value, page: 1 });
                  }}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none sm:w-auto"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
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
                    setStatus("all");
                    void load({ search: "", status: "all", page: 1 });
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
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={result?.data ?? []}
                  sort={sort}
                  order={order}
                  onSort={toggleSort}
                  empty={
                    <EmptyState
                      icon="person_search"
                      title={filtersActive ? t("admin.usersEmptyFiltered") : t("admin.usersEmptyTitle")}
                      description={
                        filtersActive
                          ? t("admin.emptyFilteredBody")
                          : t("admin.usersEmptyBody")
                      }
                      action={
                        filtersActive ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSearch("");
                              setStatus("all");
                              void load({ search: "", status: "all", page: 1 });
                            }}
                          >
                            {t("admin.clearFilters")}
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                />
                {result && result.meta.total > 0 && (
                  <Pagination meta={result.meta} onPage={(next) => void load({ page: next })} busy={loading} />
                )}
              </>
            )}
          </Panel>
        </>
      )}
    </AdminLayout>
  );
}
