"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

interface WeeklyReport {
  id: number;
  type: "weekly";
  week_start: string;
  content: {
    week_start: string;
    week_end: string;
    workouts: number;
    sets: number;
    volume_kg: number;
    prs: Array<{ exercise: string; type: string; value: number }>;
    pr_count: number;
    top_exercise: { name: string; volume: number } | null;
    summary: string;
    summary_source: "deterministic" | "ai_interpreted";
  };
  generated_at: string;
}

function formatRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return s.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " +
      e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return start + " – " + end; }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatVol(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return v.toString();
}

export default function ReviewsPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [hasSessions, setHasSessions] = useState<boolean | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: WeeklyReport[]; current_page: number; last_page: number }>("/reviews/weekly");
      setReports(res.data ?? []);
      setError("");
    } catch (e: any) {
      if (e.status === 401) { window.location.href = "/login"; return; }
      setError(e.message || "Couldn't load reviews.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => {
    apiClient.get<{ data: any[] }>("/workout-sessions?page=1").then(r => {
      setHasSessions((r.data ?? []).length > 0);
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await apiClient.post<WeeklyReport>("/reviews/weekly/generate", {});
      setReports(prev => {
        if (prev.some(r => r.id === res.id)) return prev;
        return [res, ...prev];
      });
    } catch (e: any) {
      setError(e.message || "Failed to generate review.");
    } finally { setGenerating(false); }
  };

  // "Recent" is the last four weeks. Derived once per render from a single
  // timestamp so every row is compared against the same instant rather than
  // calling Date.now() inside the filter.
  const fourWeeksAgo = Date.now() - 4 * 7 * 86400000;

  const filtered = filter === "all" ? reports
    : filter === "year" ? reports.filter(r => new Date(r.week_start).getFullYear() === new Date().getFullYear())
    : reports.filter(r => new Date(r.week_start).getTime() >= fourWeeksAgo);

  return (
    <AppLayout>
      <div className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary">Weekly Reviews</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              AI-interpreted training week summaries. Generated from your workout data.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-primary text-on-primary rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? "Generating..." : "Generate Latest"}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", label: "All" },
            { key: "year", label: "This Year" },
            { key: "month", label: "Last 4 Weeks" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-xl font-label-caps text-label-caps transition-colors ${
                filter === f.key ? "bg-primary text-on-primary" : "bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-48 rounded-xl bg-surface-container animate-pulse" />)}</div>
        ) : error ? (
          <div className="p-6 bg-error-container rounded-xl text-on-error-container text-center">
            <p>{error}</p>
            <button onClick={fetchReports} className="mt-2 text-primary font-semibold">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 text-center max-w-lg mx-auto">
            <span className="material-symbols-outlined text-4xl text-outline block mb-4">auto_awesome</span>
            <p className="font-headline-lg-mobile text-primary">No weekly reviews yet.</p>
            <p className="font-body-md text-on-surface-variant mt-1">
              {hasSessions ? "You have workouts but no reviews yet — generate to see your week summarized." : "Start logging workouts to generate reviews."}
            </p>
            <button onClick={handleGenerate} disabled={generating} className="mt-6 bg-primary text-on-primary rounded-lg px-6 py-3 font-metric-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {generating ? "Generating..." : "Generate your first summary"}
            </button>
          </div>
        ) : (
          filtered.map(r => {
            const c = r.content;
            return (
              <div key={r.id} className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="font-headline-lg-mobile text-primary">
                    {formatRange(c.week_start, c.week_end)}
                  </h3>
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Generated {formatRelative(r.generated_at)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Workouts", value: c.workouts },
                    { label: "Sets", value: c.sets },
                    { label: "Volume", value: formatVol(c.volume_kg) + " kg" },
                    { label: "PRs", value: c.pr_count },
                  ].map(m => (
                    <div key={m.label} className="bg-surface-container-low rounded-lg p-4 text-center">
                      <p className="font-label-caps text-label-caps text-on-surface-variant">{m.label}</p>
                      <p className="font-headline-lg-mobile text-primary mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>

                {c.top_exercise && (
                  <p className="font-body-md text-on-surface-variant">Top lift: <span className="font-semibold text-primary">{c.top_exercise.name}</span> ({formatVol(c.top_exercise.volume)} kg)</p>
                )}

                {c.prs.length > 0 && (
                  <div className="space-y-2">
                    {c.prs.map((pr, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="material-symbols-outlined text-secondary text-[16px]">emoji_events</span>
                        <span className="font-body-md text-on-surface">{pr.exercise} — {pr.type} {pr.value} {pr.type === "one_rm" ? "kg" : pr.type === "weight" ? "kg" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-l-4 border-secondary bg-secondary/5 rounded-r-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-body-md text-on-surface">{c.summary}</p>
                    {c.summary_source === "ai_interpreted" ? (
                      <span className="font-label-caps text-label-caps bg-secondary text-on-secondary rounded px-2 py-0.5 ml-2 shrink-0">AI</span>
                    ) : (
                      <span className="font-label-caps text-label-caps bg-surface-container-high text-on-surface-variant rounded px-2 py-0.5 ml-2 shrink-0">Deterministic</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
