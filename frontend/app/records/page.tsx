"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";

type PRType = "weight" | "one_rm" | "volume";

interface Exercise {
  name: string;
  slug: string;
}

interface PR {
  id: number;
  pr_type: PRType;
  value: number;
  achieved_at: string;
  exercise: Exercise;
}

interface PaginatedResponse {
  data: PR[];
  current_page: number;
  last_page: number;
}

const PR_TYPE_KEYS: Record<PRType, string> = {
  weight: "records.typeWeight",
  one_rm: "records.typeOneRm",
  volume: "records.typeVolume",
};

/** Human label for a PR type. Takes `t` because this is a module-level map. */
function prTypeLabel(type: PRType, t: (key: string) => string): string {
  return t(PR_TYPE_KEYS[type]);
}

const PR_TYPE_ICONS: Record<PRType, string> = {
  weight: "fitness_center",
  one_rm: "trending_up",
  volume: "stacked_bar_chart",
};

export default function RecordsPage() {
  const { t, locale } = useTranslation();
  const { label, formatWeight } = useUnit();
  const router = useRouter();
  const [filter, setFilter] = useState<PRType | "all">("all");
  const [records, setRecords] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchRecords = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      let allRecords: PR[] = [];
      let page = 1;
      let lastPage = 1;
      const query = filter !== "all" ? `?pr_type=${filter}` : "";
      do {
        const res = await apiClient.get<PaginatedResponse>(
          `/records${query}${query ? "&" : "?"}page=${page}`
        );
        /*
         * Checked INSIDE the loop, not only before the final setState.
         *
         * A filter change abandons the run in flight, but this loop can still be
         * several requests from finishing: without this it would keep walking
         * pages of the filter nobody is looking at, and the aggregate it finally
         * wrote would be a mix of pages the member never asked for.
         */
        if (id !== requestId.current) return; // stale response
        allRecords = allRecords.concat(res.data);
        page = res.current_page + 1;
        lastPage = res.last_page;
      } while (page <= lastPage);
      if (id !== requestId.current) return; // stale response
      setRecords(allRecords);
    } catch (err: any) {
      if (id !== requestId.current) return;
      if (err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err.message || t("common.loadFailed"));
    } finally {
      // Only the newest request owns the spinner. An older one clearing it
      // would reveal the empty state while the current filter is still loading.
      if (id === requestId.current) setLoading(false);
    }
    /*
     * `t` is a dependency because the catch above uses it for the fallback
     * message. It is a useCallback keyed on locale, so it is stable until the
     * language changes — at which point this callback is rebuilt and a later
     * failure reports in the new language rather than the original one.
     */
  }, [filter, router, t]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Compute highlights
  const weightRecords = records.filter((r) => r.pr_type === "weight");
  const oneRmRecords = records.filter((r) => r.pr_type === "one_rm");

  const heaviestLift = weightRecords.length
    ? weightRecords.reduce((a, b) => (a.value > b.value ? a : b))
    : null;
  const bestOneRm = oneRmRecords.length
    ? oneRmRecords.reduce((a, b) => (a.value > b.value ? a : b))
    : null;

  // Group by exercise name
  const grouped = records.reduce((acc, record) => {
    const key = record.exercise.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {} as Record<string, PR[]>);

  const sortedGroups = Object.keys(grouped).sort();

  // Retry handler
  const handleRetry = () => {
    fetchRecords();
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 animate-fadeIn">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="font-metric-display text-headline-lg-mobile md:text-metric-display text-primary tracking-tight">
            {t("records.personalRecords")}
          </h1>
          <div className="flex items-center gap-2">
            <button className="rounded-xl bg-surface-variant border border-outline-variant p-2.5 transition-colors hover:bg-primary/5">
              <span className="material-symbols-outlined text-on-surface-variant text-2xl">
                filter_list
              </span>
            </button>
            <button className="rounded-xl bg-surface-variant border border-outline-variant p-2.5 transition-colors hover:bg-primary/5">
              <span className="material-symbols-outlined text-on-surface-variant text-2xl">
                more_horiz
              </span>
            </button>
          </div>
        </header>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {(["all", "weight", "one_rm", "volume"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === type
                  ? "bg-primary text-on-primary"
                  : "bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {type === "all" ? t("records.allTypes") : prTypeLabel(type, t)}
            </button>
          ))}
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-2">
            <span className="font-label-caps text-label-caps text-outline uppercase tracking-widest">
              {t("records.heaviestLift")}
            </span>
            {heaviestLift ? (
              <>
                <div className="font-metric-display text-metric-display text-primary">
                  {formatWeight(heaviestLift.value)}{" "}
                  <span className="text-xl text-outline ml-1">{label}</span>
                </div>
                <div className="font-body-md text-body-md text-on-surface-variant">
                  {heaviestLift.exercise.name}
                </div>
                <div className="font-body-sm text-body-sm text-outline">
                  {new Date(heaviestLift.achieved_at).toLocaleDateString(locale)}
                </div>
              </>
            ) : (
              <div className="font-body-md text-body-md text-on-surface-variant">
                {t("records.noneYet")}
              </div>
            )}
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-2">
            <span className="font-label-caps text-label-caps text-outline uppercase tracking-widest">
              {t("records.best1rm")}
            </span>
            {bestOneRm ? (
              <>
                <div className="font-metric-display text-metric-display text-primary">
                  {formatWeight(bestOneRm.value)}{" "}
                  <span className="text-xl text-outline ml-1">{label}</span>
                </div>
                <div className="font-body-md text-body-md text-on-surface-variant">
                  {bestOneRm.exercise.name}
                </div>
                <div className="font-body-sm text-body-sm text-outline">
                  {new Date(bestOneRm.achieved_at).toLocaleDateString(locale)}
                </div>
              </>
            ) : (
              <div className="font-body-md text-body-md text-on-surface-variant">
                {t("records.noneYet")}
              </div>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-surface border border-outline-variant rounded-xl p-6 animate-pulse"
              >
                <div className="h-6 w-1/3 bg-surface-container-low rounded mb-4"></div>
                <div className="space-y-3">
                  <div className="h-4 w-full bg-surface-container-low rounded"></div>
                  <div className="h-4 w-2/3 bg-surface-container-low rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="font-body-md text-body-md text-on-surface-variant">
              {error}
            </div>
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-primary text-on-primary rounded-full font-medium hover:bg-primary/80 transition-colors"
            >
              {t("action.retry")}
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <span className="material-symbols-outlined text-6xl text-outline">
              fitness_center
            </span>
            <div className="font-body-lg text-body-lg text-on-surface-variant text-center">
              {t("records.empty")}
              <br />
              {t("records.keepGoing")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sortedGroups.map((exerciseName) => (
              <div key={exerciseName} className="flex flex-col gap-3">
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight">
                  {exerciseName}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {grouped[exerciseName].map((record) => (
                    <div
                      key={record.id}
                      className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4"
                    >
                      <span className="material-symbols-outlined text-2xl text-secondary">
                        {PR_TYPE_ICONS[record.pr_type]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-metric-sm text-metric-sm text-primary">
                          {formatWeight(record.value)}{" "}
                          <span className="text-sm text-outline ml-1">{label}</span>
                        </div>
                        <div className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
                          {prTypeLabel(record.pr_type, t)}
                        </div>
                      </div>
                      <div className="font-body-sm text-body-sm text-outline text-right whitespace-nowrap">
                        {new Date(record.achieved_at).toLocaleDateString(locale)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}