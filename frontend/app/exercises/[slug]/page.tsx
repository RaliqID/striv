"use client";

import AppLayout from "@/components/AppLayout";
import { useParams } from "next/navigation";

export default function ExerciseDetailPage() {
  const params = useParams();
  const slug = params.slug as string || "bench-press";
  const title = slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant mb-2">
              <span className="material-symbols-outlined text-sm cursor-pointer hover:text-primary transition-colors">
                arrow_back
              </span>
              <span className="font-label-caps text-label-caps uppercase tracking-widest">Exercises / Chest</span>
            </div>
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface tracking-tight">
              {title}
            </h1>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 border border-outline-variant rounded flex items-center gap-2 hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-[20px]">edit</span>
              <span className="font-metric-sm text-metric-sm">Edit</span>
            </button>
            <button className="px-6 py-2 bg-primary text-on-primary rounded font-metric-sm text-metric-sm hover:bg-inverse-surface transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">play_arrow</span>
              Start Workout
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-8">
          <div className="border border-outline-variant rounded-xl p-6 bg-surface flex flex-col justify-between hover:shadow-sm transition-shadow duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Current Best</h3>
              <span className="material-symbols-outlined text-outline">emoji_events</span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-metric-display text-metric-display text-on-surface">45</span>
                <span className="font-metric-sm text-metric-sm text-on-surface-variant">kg</span>
              </div>
              <p className="font-metric-sm text-metric-sm text-outline mt-1">x 10 reps (Oct 12, 2023)</p>
            </div>
          </div>

          <div className="border border-outline-variant rounded-xl p-6 bg-surface flex flex-col justify-between hover:shadow-sm transition-shadow duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary-container/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center justify-between mb-8 relative z-10">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Estimated 1RM</h3>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary-container animate-pulse"></span>
                <span className="material-symbols-outlined text-secondary-container text-[18px]">psychology</span>
              </div>
            </div>
            <div className="relative z-10">
              <div className="flex items-baseline gap-2">
                <span className="font-metric-display text-metric-display text-on-surface">60</span>
                <span className="font-metric-sm text-metric-sm text-on-surface-variant">kg</span>
              </div>
              <div className="flex items-center gap-1 mt-1 text-secondary-container">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <p className="font-metric-sm text-metric-sm">+2.5kg this month</p>
              </div>
            </div>
          </div>

          <div className="border border-outline-variant rounded-xl p-6 bg-surface flex flex-col justify-between hover:shadow-sm transition-shadow duration-300">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Total Volume</h3>
              <span className="material-symbols-outlined text-outline">stacked_bar_chart</span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-metric-display text-metric-display text-on-surface">1,240</span>
                <span className="font-metric-sm text-metric-sm text-on-surface-variant">kg</span>
              </div>
              <p className="font-metric-sm text-metric-sm text-outline mt-1">Last 30 days</p>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}