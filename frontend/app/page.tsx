"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const handleNavClick = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      router.push(path);
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="sticky top-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant py-4">
        <div className="flex items-center gap-gutter">
          <span className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-black text-primary tracking-tighter">
            Striv
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md transition-colors">Overview</Link>
          <a href="#" onClick={handleNavClick("/workout")} className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer">Workout</a>
          <a href="#" onClick={handleNavClick("/progress")} className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer">Progress</a>
          <a href="#" onClick={handleNavClick("/insights")} className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer">Insights</a>
        </nav>
        <div className="flex items-center gap-4">
          <button className="hidden md:flex text-on-surface hover:bg-surface-container-low transition-colors p-2 rounded-full">
            <span className="material-symbols-outlined">search</span>
          </button>
          <Link href="/login" className="text-on-surface hover:bg-surface-container-low transition-colors p-2 rounded-full">
            <span className="material-symbols-outlined">account_circle</span>
          </Link>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-32 px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto gap-24">
        <section className="w-full flex flex-col items-center text-center gap-8 max-w-3xl">
          <h1 className="font-metric-display text-metric-display md:text-[72px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
            Your training has a story.
          </h1>
          <p className="font-body-md text-body-md md:text-xl text-on-surface-variant max-w-2xl text-balance">
            Track your workouts, discover your progress, and understand what your training data is telling you with precision analytics designed for serious athletes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full sm:w-auto">
            <Link href="/register" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-lg hover:bg-primary/90 transition-colors shadow-sm active:scale-95 duration-200">
              Start Tracking
            </Link>
            <Link href="/register" className="bg-surface text-primary border border-outline font-metric-sm text-metric-sm px-8 py-4 rounded-lg hover:bg-surface-container-low transition-colors active:scale-95 duration-200">
              See How It Works
            </Link>
          </div>
        </section>

        <section className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[240px]">
          <div className="md:col-span-8 row-span-2 border border-outline-variant rounded-xl p-8 bg-surface flex flex-col gap-6 relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300">
            <div className="flex justify-between items-start z-10">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">Volume Progression</h3>
                <p className="font-headline-lg-mobile text-headline-lg-mobile text-primary font-semibold">14,250 kg</p>
              </div>
              <span className="material-symbols-outlined text-secondary">auto_graph</span>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-2/3 opacity-80 pointer-events-none flex items-end">
              <svg className="w-full h-full stroke-primary fill-none" preserveAspectRatio="none" viewBox="0 0 100 50">
                <path className="fill-surface-container-highest/30 stroke-none" d="M0,50 L0,40 L10,35 L20,45 L30,30 L40,25 L50,35 L60,15 L70,20 L80,10 L90,5 L100,10 L100,50 Z" />
                <path className="stroke-primary" d="M0,40 L10,35 L20,45 L30,30 L40,25 L50,35 L60,15 L70,20 L80,10 L90,5 L100,10" strokeWidth="0.5" />
                <path className="stroke-secondary" d="M0,45 Q 25,35 50,30 T 100,5" strokeDasharray="2 2" strokeWidth="0.5" />
              </svg>
            </div>
          </div>

          <Link href="/workout" className="md:col-span-4 row-span-1 border border-outline-variant rounded-xl p-6 bg-surface flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 cursor-pointer">
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Next Session</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">fitness_center</span>
            </div>
            <div>
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-primary font-semibold">Hypertrophy B</h4>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">Est. 65 mins</p>
            </div>
          </Link>

          <Link href="/insights" className="md:col-span-4 row-span-1 border border-secondary/20 rounded-xl p-6 bg-secondary-fixed/30 flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 relative overflow-hidden cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/10 blur-2xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(70,72,212,0.6)]"></div>
              <span className="font-label-caps text-label-caps text-secondary font-semibold uppercase tracking-wider">AI Insight</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed text-sm">
              Recovery indicates you can push harder on primary compound lifts today. Consider a 5% load increase.
            </p>
          </Link>
        </section>
      </main>
    </div>
  );
}