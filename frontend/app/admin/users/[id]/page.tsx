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
import type { AdminUser, AdminUserDetail, Capability } from "@/types/admin";
import Link from "next/link";import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const PROFILE_LABELS: Record<string, string> = {
  age: "Age",
  location: "Location",
  weight_kg: "Weight (kg)",
  height_cm: "Height (cm)",
  target_weight_kg: "Target weight (kg)",
  experience_level: "Experience",
  primary_goal: "Primary goal",
  training_frequency: "Frequency",
};

type DialogState =
  | { kind: "none" }
  | { kind: "suspend" }
  | { kind: "revoke_admin" }
  | { kind: "delete" }
  | { kind: "reset_password"; temp: string };

export default function AdminUserDetailPage() {
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
      const { kind, message } = classifyError(caught);
      if (kind === "unauthorized") return redirectToLogin();
      if (kind === "forbidden") setDenied(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

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
      const { kind, message } = classifyError(caught);
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
      "Account updated.",
      () => setEditing(false)
    );

  const toggleSuspension = () => {
    const suspended = data?.user.is_suspended;
    act(
      () =>
        apiClient.post<{ user: AdminUser }>(
          `/admin/users/${params.id}/${suspended ? "unsuspend" : "suspend"}`
        ),
      suspended ? "User unsuspended." : "User suspended."
    ).then(() => setDialog({ kind: "none" }));
  };

  const toggleAdmin = () => {
    const isAdmin = data?.user.is_admin;
    act(
      () =>
        apiClient.put<{ user: AdminUser; message: string }>(`/admin/users/${params.id}/role`, {
          is_admin: !isAdmin,
        }),
      isAdmin ? "Admin rights revoked." : "Admin rights granted."
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
      const { kind, message } = classifyError(caught);
      if (kind === "unauthorized") return redirectToLogin();
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const revokeSessions = () =>
    act(
      () => apiClient.post<{ revoked: number; message: string }>(`/admin/users/${params.id}/revoke-sessions`),
      "Sessions revoked."
    );

  const deleteUser = async () => {
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(`/admin/users/${params.id}`);
      toast.success("Account deleted.");
      router.push("/admin/users");
    } catch (caught) {
      const { kind, message } = classifyError(caught);
      if (kind === "unauthorized") return redirectToLogin();
      toast.error(message);
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <AdminLayout title="User account">
        <LoadingRows rows={4} />
      </AdminLayout>
    );
  }

  if (denied) {
    return (
      <AdminLayout title="User account">
        <ErrorBanner message="This area is available to administrators only." />
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout title="User account">
        <ErrorBanner message={error || "User not found."} onRetry={load} />
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
        All users
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
                {user.is_admin ? <Badge tone="primary">Administrator</Badge> : <Badge>Member</Badge>}
                {user.is_suspended ? (
                  <Badge tone="danger">Suspended</Badge>
                ) : (
                  <Badge tone="success">Active</Badge>
                )}
                {user.must_change_password && <Badge tone="warning">Password reset pending</Badge>}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-right sm:shrink-0">
            <div>
              <dt className="font-label-caps text-label-caps text-on-surface-variant">Joined</dt>
              <dd className="font-metric-sm text-metric-sm text-on-surface">
                {formatRelative(user.created_at)}
              </dd>
            </div>
            <div>
              <dt className="font-label-caps text-label-caps text-on-surface-variant">Last active</dt>
              <dd className="font-metric-sm text-metric-sm text-on-surface">
                {formatRelative(user.last_active_at)}
              </dd>
            </div>
          </dl>
        </div>
      </Panel>

      {/* Engagement metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Workouts", value: formatNumber(stats.total_workouts), detail: `${formatNumber(stats.workouts_30d)} in 30d` },
          { label: "Total sets", value: formatNumber(stats.total_sets), detail: "All time" },
          { label: "Volume", value: formatVolume(stats.volume_all_time_kg), detail: "All time" },
          { label: "Active sessions", value: formatNumber(stats.active_tokens), detail: `${formatNumber(stats.goals_count)} goals` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
            <p className="font-label-caps text-label-caps text-on-surface-variant">{card.label}</p>
            <p className="mt-2 break-words font-headline-lg text-headline-lg text-primary">{card.value}</p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account details / edit */}
        <Panel
          title="Account details"
          description="Correct the member's name or email address."
          action={
            !editing ? (
              <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditing(true)}>
                Edit
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
                <span className="font-label-caps text-label-caps text-on-surface-variant">Name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  required
                  maxLength={255}
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Email</span>
                <input
                  type="email"
                  value={draftEmail}
                  onChange={(event) => setDraftEmail(event.target.value)}
                  required
                  maxLength={255}
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
                <span className="mt-1 block font-body-md text-body-md text-on-surface-variant">
                  Changing the email signs the member out of all devices.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" busy={busy} disabled={busy}>
                  Save changes
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
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">Name</dt>
                <dd className="mt-1 break-words font-body-md text-body-md text-on-surface">{user.name}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">Email</dt>
                <dd className="mt-1 break-all font-body-md text-body-md text-on-surface">{user.email}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">Joined</dt>
                <dd className="mt-1 font-body-md text-body-md text-on-surface">{formatDateTime(user.created_at)}</dd>
              </div>
              <div>
                <dt className="font-label-caps text-label-caps text-on-surface-variant">Chat messages</dt>
                <dd className="mt-1 font-body-md text-body-md text-on-surface">
                  {formatNumber(stats.chat_messages_total)}
                </dd>
              </div>
            </dl>
          )}
        </Panel>

        {/* Training profile */}
        <Panel title="Training profile" description="Onboarding answers supplied by the member.">
          {profileEntries.length ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {profileEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="font-label-caps text-label-caps text-on-surface-variant">
                    {PROFILE_LABELS[key] ?? key.replace(/_/g, " ")}
                  </dt>
                  <dd className="mt-1 break-words font-body-md text-body-md text-on-surface">
                    {value == null || value === "" ? "—" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState icon="badge" title="No profile data." description="The member has not completed onboarding." />
          )}
        </Panel>
      </div>

      {/* Access control */}
      <Panel title="Access control" description="Change what this account can do and where it is signed in.">
        <div className="divide-y divide-outline-variant">
          <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">
                {user.is_suspended ? "Suspended" : "Active"}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {user.is_suspended
                  ? "This member cannot sign in. Suspending also ends all sessions."
                  : "Suspending blocks sign-in immediately and revokes every session."}
              </p>
            </div>
            <Button
              variant={user.is_suspended ? "secondary" : "danger"}
              size="sm"
              onClick={() => setDialog({ kind: "suspend" })}
              disabled={busy || !capabilities.suspend.allowed}
              title={guardReason(capabilities.suspend)}
            >
              {user.is_suspended ? "Unsuspend account" : "Suspend account"}
            </Button>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">
                {user.is_admin ? "Administrator" : "Member"}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Administrators can view every account and change platform data.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                user.is_admin && capabilities.revoke_admin.allowed
                  ? setDialog({ kind: "revoke_admin" })
                  : void toggleAdmin()
              }
              disabled={busy || (user.is_admin && !capabilities.revoke_admin.allowed)}
              title={user.is_admin ? guardReason(capabilities.revoke_admin) : undefined}
            >
              {user.is_admin ? "Revoke admin rights" : "Grant admin rights"}
            </Button>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">Password</p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Issues a one-time password and signs the member out everywhere.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={resetPassword} busy={busy} disabled={busy}>
              Reset password
            </Button>
          </div>

          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-metric-sm text-metric-sm text-on-surface">Active sessions</p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {formatNumber(stats.active_tokens)} active session
                {stats.active_tokens === 1 ? "" : "s"}. Signing out does not change the password.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={revokeSessions}
              busy={busy}
              disabled={busy || stats.active_tokens === 0}
            >
              Sign out everywhere
            </Button>
          </div>
        </div>
      </Panel>

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent workouts" description="Last 10 sessions" bodyClassName="p-0">
          {data.recent_workouts.length ? (
            <ul className="divide-y divide-outline-variant">
              {data.recent_workouts.map((workout) => (
                <li key={workout.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-metric-sm text-metric-sm text-on-surface">
                      {formatDateTime(workout.started_at)}
                    </p>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {formatNumber(workout.total_sets)} sets · {formatVolume(workout.total_volume_kg)}
                    </p>
                  </div>
                  <Badge tone={workout.status === "completed" ? "success" : "warning"}>
                    {workout.status === "completed" ? "Completed" : "In progress"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon="fitness_center" title="No workouts logged." />
            </div>
          )}
        </Panel>

        <Panel title="Coach conversations" description="Last 20 sessions" bodyClassName="p-0">
          {data.chat_sessions.length ? (
            <ul className="divide-y divide-outline-variant">
              {data.chat_sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-metric-sm text-metric-sm text-on-surface">
                      {session.title || `Session #${session.id}`}
                    </p>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {formatNumber(session.messages_count)} messages ·{" "}
                      {formatRelative(session.last_message_at)}
                    </p>
                  </div>
                  {session.has_images && (
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant" title="Contains images">
                      image
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon="chat" title="No conversations." />
            </div>
          )}
        </Panel>
      </div>

      {/* Danger zone */}
      <Panel
        title="Danger zone"
        description="Irreversible actions. These are recorded in the audit log."
        className="border-error/30"
        bodyClassName="p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-metric-sm text-metric-sm text-on-surface">Delete this account</p>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Permanently removes the member and all of their data. This cannot be undone.
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
            Delete account
          </Button>
        </div>
      </Panel>

      {/* Dialogs */}
      <ConfirmDialog
        open={dialog.kind === "suspend"}
        title={user.is_suspended ? "Unsuspend this account?" : "Suspend this account?"}
        description={
          user.is_suspended
            ? `${user.name} will be able to sign in again immediately.`
            : `${user.name} will be signed out of every device and blocked from signing in until unsuspended.`
        }
        confirmLabel={user.is_suspended ? "Unsuspend account" : "Suspend account"}
        tone={user.is_suspended ? "primary" : "danger"}
        busy={busy}
        onConfirm={toggleSuspension}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <ConfirmDialog
        open={dialog.kind === "revoke_admin"}
        title="Revoke administrator rights?"
        description={`${user.name} will lose access to the admin area immediately.`}
        confirmLabel="Revoke admin rights"
        busy={busy}
        onConfirm={toggleAdmin}
        onCancel={() => setDialog({ kind: "none" })}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        title="Delete this account?"
        description={
          <>
            This permanently deletes <strong className="text-on-surface">{user.name}</strong> and every
            workout, goal and conversation belonging to them. It cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        requireText={user.email}
        busy={busy}
        onConfirm={deleteUser}
        onCancel={() => setDialog({ kind: "none" })}
      />

      {dialog.kind === "reset_password" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-xl">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
              Temporary password
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
                  toast.success("Password copied.");
                }}
              >
                Copy
              </Button>
              <Button onClick={() => setDialog({ kind: "none" })}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
