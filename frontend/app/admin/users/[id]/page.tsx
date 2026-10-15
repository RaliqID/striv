"use client";

import AdminLayout from "@/components/admin/AdminLayout";
import Badge from "@/components/admin/Badge";
import Button from "@/components/admin/Button";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Panel from "@/components/admin/Panel";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { useToast } from "@/components/admin/Toast";
import { apiClient } from "@/lib/api";
import {
  classifyError,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatVolume,
  redirectToLogin,
} from "@/lib/admin";
import type { AdminUser, AdminUserDetail, Capability, UserRole } from "@/types/admin";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const PROFILE_LABELS: Record<string, string> = {
  age: "profile.age",
  location: "profile.location",
  weight_kg: "profile.weight",
  height_cm: "profile.height",
  target_weight_kg: "profile.targetWeight",
  experience_level: "profile.experience",
  primary_goal: "profile.primaryGoal",
  training_frequency: "profile.frequency",
};

/**
 * Role descriptions, shown so an operator understands the consequence of the
 * change they are about to make rather than guessing from a label.
 */
const ROLE_LABELS: Record<UserRole, { titleKey: string; descriptionKey: string }> = {
  user: {
    titleKey: "admin.roleMember",
    descriptionKey: "admin.roleMemberDesc",
  },
  trainer: {
    titleKey: "admin.roleTrainer",
    descriptionKey: "admin.roleTrainerDesc",
  },
  admin: {
    titleKey: "admin.roleAdmin",
    descriptionKey: "admin.roleAdminDesc",
  },
};

type DialogState =
  | { kind: "none" }
  | { kind: "suspend" }
  | { kind: "revoke_admin"; targetRole?: UserRole }
  | { kind: "promote_trainer" }
  | { kind: "delete" }
  | { kind: "reset_password"; temp: string };

export default function AdminUserDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = await apiClient.get<AdminUserDetail>(`/admin/users/${params.id}`);
      setData(detail);
      setDraftName(detail.user.name);
      setDraftEmail(detail.user.email);
      setDenied(false);
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [params.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a mutation, refresh the record, and surface the outcome. */
  const act = async (
    run: () => Promise<{ message?: string } | unknown>,
    fallbackMessage: string,
    onSuccess?: (_result: unknown) => void
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await run();
      await load();
      const message =
        (result as { message?: string } | null)?.message ?? fallbackMessage;
      toast.success(message);
      onSuccess?.(result);
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      // 422 responses here mean a guard refused the action — show why.
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = () =>
    act(
      () =>
        apiClient.put<{ user: AdminUser; message: string }>(`/admin/users/${params.id}`, {
          name: draftName.trim(),
          email: draftEmail.trim(),
        }),
      t("admin.accountUpdated"),
      () => setEditing(false)
    );

  const toggleSuspension = () => {
    const suspended = data?.user.is_suspended;
    act(
      () =>
        apiClient.post<{ user: AdminUser }>(
          `/admin/users/${params.id}/${suspended ? "unsuspend" : "suspend"}`
        ),
      suspended ? t("admin.userUnsuspended") : t("admin.userSuspended")
    ).then(() => setDialog({ kind: "none" }));
  };

  /**
   * Change the account's role.
   *
   * Three roles now, not a boolean: a member can be promoted to trainer (which
   * unlocks the client workspace) or to admin. Promoting to trainer requires a
   * specialisation so the matcher has something to route on, so that is
   * collected in the dialog before the request goes out.
   */
  const changeRole = (role: UserRole, extras?: { specialization?: string; capacity?: number }) => {
    const labels: Record<UserRole, string> = {
      user: t("admin.roleRestoredMember"),
      trainer: t("admin.roleGrantedTrainer"),
      admin: t("admin.roleGrantedAdmin"),
    };
    act(
      () =>
        apiClient.put<{ user: AdminUser; message: string }>(`/admin/users/${params.id}/role`, {
          role,
          ...(extras ?? {}),
        }),
      labels[role]
    ).then(() => setDialog({ kind: "none" }));
  };

  const resetPassword = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiClient.post<{ temporary_password: string; message: string }>(
        `/admin/users/${params.id}/reset-password`
      );
      await load();
      setDialog({ kind: "reset_password", temp: result.temporary_password });
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const revokeSessions = () =>
    act(
      () => apiClient.post<{ revoked: number; message: string }>(`/admin/users/${params.id}/revoke-sessions`),
      t("admin.sessionsRevoked")
    );

  const deleteUser = async () => {
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(`/admin/users/${params.id}`);
      toast.success(t("admin.accountDeleted"));
      router.push("/admin/users");
    } catch (caught) {
      const { kind, message } = classifyError(caught, t);
      if (kind === "unauthorized") return redirectToLogin();
      toast.error(message);
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <AdminLayout title={t("admin.userAccount")}>
        <LoadingRows rows={4} />
      </AdminLayout>
    );
  }

  if (denied) {
    return (
      <AdminLayout title={t("admin.userAccount")}>
        <ErrorBanner message={t("admin.adminsOnly")} />
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout title={t("admin.userAccount")}>
        <ErrorBanner message={error || t("admin.userNotFound")} onRetry={load} />
      </AdminLayout>
    );
  }

  const { user, stats, capabilities } = data;
  const profileEntries = Object.entries(data.profile ?? {});

  const guardReason = (capability: Capability) =>
    capability.allowed ? undefined : capability.reason ?? undefined;

  return (
    <AdminLayout title={user.name} description={user.email}>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 font-metric-sm text-metric-sm text-on-surface-variant hover:text-primary"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          arrow_back
        </span>
        {t("admin.allUsers")}
      </Link>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* Identity header */}
      <Panel bodyClassName="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tertiary-fixed font-headline-lg text-headline-lg text-on-surface">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="break-words font-headline-lg text-headline-lg text-primary">{user.name}</h2>
              <p className="break-all font-body-md text-body-md text-on-surface-variant">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={user.role === "admin" ? "primary" : undefined}>
                  {t(ROLE_LABELS[user.role].titleKey)}
                </Badge>
                {user.is_suspended ? (
                  <Badge tone="danger">{t("admin.suspendedLabel")}</Badge>
                ) : (
                  <Badge tone="success">{t("admin.statusActive")}</Badge>
                )}
                {user.must_change_password && <Badge tone="warning">{t("admin.resetPending")}</Badge>}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-right sm:shrink-0">
            <div>
              <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.joined")}</dt>
              <dd className="font-metric-sm text-metric-sm text-on-surface">
                {formatRelative(user.created_at, t, locale)}
              </dd>
            </div>
            <div>
              <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.lastActive")}</dt>
              <dd className="font-metric-sm text-metric-sm text-on-surface">
                {formatRelative(user.last_active_at, t, locale)}
              </dd>
            </div>
          </dl>
        </div>
      </Panel>

      {/* Engagement metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { labelKey: "dashboard.statWorkouts", value: formatNumber(stats.total_workouts), detail: t("admin.in30d", { count: formatNumber(stats.workouts_30d) }) },
          { labelKey: "client.totalSets", value: formatNumber(stats.total_sets), detail: t("admin.allTime") },
          { labelKey: "progress.volume", value: formatVolume(stats.volume_all_time_kg), detail: t("admin.allTime") },
          { labelKey: "admin.activeSessions", value: formatNumber(stats.active_tokens), detail: t("admin.goalCount", { count: formatNumber(stats.goals_count) }) },
        ].map((card) => (
          <div key={card.labelKey} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <p className="font-label-caps text-label-caps text-on-surface-variant">{t(card.labelKey)}</p>
            <p className="mt-2 break-words font-headline-lg text-headline-lg text-primary">{card.value}</p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account details / edit */}
        <Panel
          title={t("admin.accountDetails")}
          description={t("admin.accountDetailsDesc")}
          action={
            !editing ? (
              <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>
                {t("action.edit")}
              </Button>
            ) : undefined
          }
        >
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.fieldName")}</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  required
                  maxLength={255}
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.fieldEmail")}</span>
                <input
                  type="email"
                  value={draftEmail}
                  onChange={(event) => setDraftEmail(event.target.value)}
                  required
                  maxLength={255}
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
                <span className="mt-1 block font-body-md text-body-md text-on-surface-variant">
                  {t("admin.emailChangeWarning")}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" busy={busy} disabled={busy}>
                  {t("settings.saveChanges")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setDraftName(user.name);
                    setDraftEmail(user.email);
                  }}
                >
                  {t("action.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.fieldName")}</dt>
                <dd className="mt-1 break-words font-body-md text-body-md text-on-surface">{user.name}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.fieldEmail")}</dt>
                <dd className="mt-1 break-all font-body-md text-body-md text-on-surface">{user.email}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.joined")}</dt>
                <dd className="mt-1 font-body-md text-body-md text-on-surface">{formatDateTime(user.created_at, locale)}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">{t("admin.chatMessages")}</dt>
                <dd className="mt-1 font-body-md text-body-md text-on-surface">
                  {formatNumber(stats.chat_messages_total)}
                </dd>
              </div>
            </dl>
          )}
        </Panel>

        {/* Training profile */}
        <Panel title={t("admin.trainingProfile")} description={t("admin.trainingProfileDesc")}>
          {profileEntries.length ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {profileEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="font-label-caps text-label-caps text-on-surface-variant">
                    {PROFILE_LABELS[key] ? t(PROFILE_LABELS[key]) : key.replace(/_/g, " ")}
                  </dt>
                  <dd className="mt-1 break-words font-body-md text-body-md text-on-surface">
                    {value == null || value === "" ? "—" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState icon="badge" title={t("admin.noProfileData")} description={t("admin.noProfileDesc")} />
          )}
        </Panel>
      </div>

      {/* Access control */}
      <Panel title={t("admin.accessControl")} description={t("admin.accessControlDesc")}>
        <div className="divide-y divide-outline-variant">
          <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">
                {user.is_suspended ? t("admin.userSuspended") : t("admin.statusActive")}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {user.is_suspended
                  ? t("admin.suspendBodyOn")
                  : t("admin.suspendBodyOff")}
              </p>
            </div>
            <Button
              variant={user.is_suspended ? "secondary" : "danger"}
              size="sm"
              onClick={() => setDialog({ kind: "suspend" })}
              disabled={busy || !capabilities.suspend.allowed}
              title={guardReason(capabilities.suspend)}
            >
              {user.is_suspended ? t("admin.unsuspend") : t("admin.suspend")}
            </Button>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">
                {t("admin.roleLabel")}: {t(ROLE_LABELS[user.role].titleKey)}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t(ROLE_LABELS[user.role].descriptionKey)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Each target role gets its own button, and the current one is
                  disabled, so it is always clear what the account is now and
                  what clicking will do. */}
              {(["user", "trainer", "admin"] as UserRole[]).map((role) => {
                const isCurrent = user.role === role;
                // Demoting the last admin is refused server-side; disable it
                // here so the operator sees why before clicking.
                const blockedByGuard =
                  user.role === "admin" && role !== "admin" && !capabilities.revoke_admin.allowed;

                return (
                  <Button
                    key={role}
                    variant={isCurrent ? "primary" : "secondary"}
                    size="sm"
                    onClick={() =>
                      role === "trainer"
                        ? setDialog({ kind: "promote_trainer" })
                        : user.role === "admin"
                          ? setDialog({ kind: "revoke_admin", targetRole: role })
                          : changeRole(role)
                    }
                    disabled={busy || isCurrent || blockedByGuard}
                    title={blockedByGuard ? guardReason(capabilities.revoke_admin) : undefined}
                  >
                    {isCurrent ? `${t(ROLE_LABELS[role].titleKey)} ${t("admin.current")}` : t("admin.makeRole", { role: t(ROLE_LABELS[role].titleKey) })}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">{t("admin.password")}</p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("admin.resetPasswordHint")}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={resetPassword} busy={busy} disabled={busy}>
              {t("admin.resetPassword")}
            </Button>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">{t("admin.activeSessions")}</p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("admin.sessionCountHint", { count: formatNumber(stats.active_tokens) })}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={revokeSessions}
              busy={busy}
              disabled={busy || stats.active_tokens === 0}
            >
              {t("admin.revokeSessions")}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("admin.recentWorkouts")} description={t("admin.last10")} bodyClassName="p-0">
          {data.recent_workouts.length ? (
            <ul className="divide-y divide-outline-variant">
              {data.recent_workouts.map((workout) => (
                <li key={workout.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-metric-sm text-metric-sm text-on-surface">
                      {formatDateTime(workout.started_at, locale)}
                    </p>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {formatNumber(workout.total_sets)} sets · {formatVolume(workout.total_volume_kg)}
                    </p>
                  </div>
                  <Badge tone={workout.status === "completed" ? "success" : "warning"}>
                    {workout.status === "completed" ? t("workout.completed") : t("workout.inProgress")}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon="fitness_center" title={t("admin.noWorkouts")} />
            </div>
          )}
        </Panel>

        <Panel title={t("admin.coachConversations")} description={t("admin.last20")} bodyClassName="p-0">
          {data.chat_sessions.length ? (
            <ul className="divide-y divide-outline-variant">
              {data.chat_sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-metric-sm text-metric-sm text-on-surface">
                      {session.title || t("admin.sessionNumber", { id: session.id })}
                    </p>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {formatNumber(session.messages_count)} messages ·{" "}
                      {formatRelative(session.last_message_at, t, locale)}
                    </p>
                  </div>
                  {session.has_images && (
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant" title={t("admin.containsImages")}>
                      image
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon="chat" title={t("admin.noConversations")} />
            </div>
          )}
        </Panel>
      </div>

      {/* Danger zone */}
      <Panel
        title={t("admin.dangerZone")}
        description={t("admin.dangerZoneDesc")}
        className="border-error/30"
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-metric-sm text-metric-sm text-on-surface">{t("admin.deleteAccountLabel")}</p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("admin.deleteHint")}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon="delete"
            onClick={() => setDialog({ kind: "delete" })}
            disabled={busy || !capabilities.delete.allowed}
            title={guardReason(capabilities.delete)}
          >
            {t("settings.deleteAccount")}
          </Button>
        </div>
      </Panel>

      {/* Dialogs */}
      <ConfirmDialog
        open={dialog.kind === "suspend"}
        title={user.is_suspended ? t("admin.unsuspendTitle") : t("admin.suspendTitle")}
        description={
          user.is_suspended
            ? t("admin.unsuspendBody", { name: user.name })
            : t("admin.suspendBody", { name: user.name })
        }
        confirmLabel={user.is_suspended ? t("admin.unsuspend") : t("admin.suspend")}
        tone={user.is_suspended ? "primary" : "danger"}
        busy={busy}
        onConfirm={toggleSuspension}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <ConfirmDialog
        open={dialog.kind === "revoke_admin"}
        title={t("admin.confirmRoleChange")}
        description={t("admin.revokeAdminBody", { name: user.name })}
        confirmLabel={t("admin.changeRoleAction")}
        tone="danger"
        busy={busy}
        onConfirm={() => changeRole(dialog.kind === "revoke_admin" ? (dialog.targetRole ?? "user") : "user")}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <PromoteTrainerDialog
        open={dialog.kind === "promote_trainer"}
        name={user.name}
        busy={busy}
        onConfirm={(specialization, capacity) => changeRole("trainer", { specialization, capacity })}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        title={t("admin.confirmDelete")}
        description={
          <>
            This permanently deletes <strong className="text-on-surface">{user.name}</strong> and every
            workout, goal and conversation belonging to them. It cannot be undone.
          </>
        }
        confirmLabel={t("settings.deletePermanently")}
        requireText={user.email}
        busy={busy}
        onConfirm={deleteUser}
        onCancel={() => setDialog({ kind: "none" })}
      />

      {dialog.kind === "reset_password" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-xl">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
              {t("admin.tempPassword")}
            </h2>
            <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
              Share this with {user.name} over a secure channel. It is shown only once and they must
              change it at next sign-in.
            </p>
            <p className="mt-4 select-all break-all rounded-lg border border-outline-variant bg-surface-container-high p-4 font-mono text-[15px] text-on-surface">
              {dialog.temp}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(dialog.temp);
                  toast.success(t("admin.passwordCopied"));
                }}
              >
                {t("action.copy")}
              </Button>
              <Button onClick={() => setDialog({ kind: "none" })}>{t("action.done")}</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

/**
 * Promote a member to personal trainer.
 *
 * Specialisation and capacity are collected here rather than defaulted, because
 * both feed the matcher immediately: the specialisation decides which members
 * get routed to this person, and capacity is the hard ceiling on how many they
 * can take. A trainer created with neither would be eligible for everyone and
 * limited by nothing.
 */
function PromoteTrainerDialog({
  open,
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  name: string;
  busy: boolean;
  onConfirm: (specialization: string, capacity: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [specialization, setSpecialization] = useState("muscle");
  const [capacity, setCapacity] = useState("20");

  if (!open) return null;

  const input =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.ariaMakeTrainer", { name })}
    >
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface p-5">
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">
          {t("admin.makeTrainerTitleNamed", { name })}
        </h2>
        <p className="mb-4 font-body-md text-sm text-on-surface-variant">
          {t("admin.makeTrainerBody")}
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
            {t("settings.specialisation")}
          </span>
          <select value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={input}>
            <option value="muscle">{t("settings.specMuscle")}</option>
            <option value="strength">{t("settings.specStrength")}</option>
            <option value="endurance">{t("settings.specEndurance")}</option>
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
            {t("settings.capacity")}
          </span>
          <input
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={input}
          />
          <span className="mt-1 block font-body-md text-sm text-on-surface-variant">
            {t("admin.capacityHint")}
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => onConfirm(specialization, Number(capacity) || 20)}
            disabled={busy}
          >
            {busy ? t("admin.promoting") : t("admin.makeTrainer")}
          </Button>
        </div>
      </div>
    </div>
  );
}
