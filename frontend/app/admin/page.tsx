"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import type { AdminStats } from "@/types/admin";
import Link from "next/link";
import { useEffect, useState } from "react";

const number = (value: number) => new Intl.NumberFormat().format(value || 0);
const volume = (value: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value || 0)} kg`;
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: string }) {
  return <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 min-w-0">
    <div className="flex items-start justify-between gap-3"><p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p><span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">{icon}</span></div>
    <p className="mt-4 font-headline-lg text-headline-lg text-primary break-words">{value}</p>
    {detail && <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{detail}</p>}
  </div>;
}

function AdminDenied() { return <div className="rounded-xl bg-error-container p-6 text-on-error-container"><h2 className="font-headline-lg text-headline-lg">Access denied</h2><p className="mt-2 font-body-md text-body-md">This area is available to administrators only.</p></div>; }

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  useEffect(() => { (async () => {
    try { setStats(await apiClient.get<AdminStats>("/admin/stats")); }
    catch (e) { const err = e as ApiError; if (err.status === 401) window.location.href = "/login"; else if (err.status === 403) setDenied(true); else setError(err.message || "Could not load admin overview."); }
    finally { setLoading(false); }
  })(); }, []);

  return <AppLayout><div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-label-caps text-label-caps text-on-surface-variant">Administration</p><h1 className="mt-1 font-headline-lg text-headline-lg text-primary">Overview</h1><p className="mt-1 font-body-md text-body-md text-on-surface-variant">Platform activity and account health.</p></div><Link href="/admin/users" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 font-metric-sm text-metric-sm text-on-primary hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Manage users</Link></div>
    {loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-surface-container" />)}</div>}
    {denied && <AdminDenied />}
    {error && !denied && <div role="alert" className="rounded-xl bg-error-container p-4 font-body-md text-body-md text-on-error-container">{error}</div>}
    {stats && !denied && <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Total users" value={number(stats.total_users)} detail={`+${number(stats.new_users_7d)} in 7 days`} icon="group" /><StatCard label="Active users" value={number(stats.active_users_30d)} detail="Active in 30 days" icon="person_check" /><StatCard label="Workouts" value={number(stats.workouts_30d)} detail={`${number(stats.total_workouts)} all time`} icon="fitness_center" /><StatCard label="Volume" value={volume(stats.volume_30d_kg)} detail={`${number(stats.total_sets)} total sets`} icon="monitoring" /></div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><section className="min-w-0 rounded-xl border border-outline-variant bg-surface-container-lowest p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-metric-sm text-metric-sm text-primary">Signups</h2><p className="mt-1 font-body-md text-body-md text-on-surface-variant">Last 30 days</p></div><span className="font-metric-sm text-metric-sm text-primary">{number(stats.new_users_7d)} new</span></div><div className="mt-6 flex h-48 items-end gap-1 overflow-hidden border-b border-outline-variant pb-1">{stats.signups_series.length ? stats.signups_series.map((point) => { const max = Math.max(...stats.signups_series.map((entry) => entry.count), 1); return <div key={point.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${date(point.date)}: ${point.count}`}><div className="w-full max-w-5 rounded-t bg-secondary transition-all group-hover:bg-primary" style={{ height: `${Math.max((point.count / max) * 100, 4)}%` }} /><span className="sr-only">{date(point.date)}: {point.count}</span></div>; }) : <p className="pb-5 font-body-md text-body-md text-on-surface-variant">No signup data available.</p>}</div></section><section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"><h2 className="font-metric-sm text-metric-sm text-primary">Top exercises</h2><div className="mt-4 space-y-3">{stats.top_exercises.length ? stats.top_exercises.slice(0, 6).map((exercise, index) => <div key={exercise.name} className="flex items-center gap-3"><span className="w-5 font-label-caps text-label-caps text-on-surface-variant">{index + 1}</span><span className="min-w-0 flex-1 truncate font-body-md text-body-md text-on-surface">{exercise.name}</span><span className="font-metric-sm text-metric-sm text-primary">{number(exercise.uses)}</span></div>) : <p className="font-body-md text-body-md text-on-surface-variant">No exercise data available.</p>}</div></section></div>
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"><h2 className="font-metric-sm text-metric-sm text-primary">Activity summary</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><div><p className="font-label-caps text-label-caps text-on-surface-variant">Chat messages</p><p className="mt-1 font-headline-lg text-headline-lg text-primary">{number(stats.chat_messages_30d)}</p><p className="font-body-md text-body-md text-on-surface-variant">Last 30 days</p></div><div><p className="font-label-caps text-label-caps text-on-surface-variant">Image messages</p><p className="mt-1 font-headline-lg text-headline-lg text-primary">{number(stats.ai_image_messages_30d)}</p><p className="font-body-md text-body-md text-on-surface-variant">AI coach uploads</p></div><div><p className="font-label-caps text-label-caps text-on-surface-variant">Suspended accounts</p><p className="mt-1 font-headline-lg text-headline-lg text-primary">{number(stats.suspended_users)}</p><p className="font-body-md text-body-md text-on-surface-variant">Current total</p></div></div></section>
    </>}
  </div></AppLayout>;
}