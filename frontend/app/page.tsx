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
    <div className="min-h-screen bg-surface flex flex-col">
      {/* TopAppBar */}
      <header className="sticky top-0 w-full z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant py-4">
        <div className="flex items-center gap-gutter">
          <span className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg font-black text-primary tracking-tighter">Striv</span>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          <a className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md transition-colors" href="#">Overview</a>
          <a className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer" onClick={handleNavClick("/workout")}>Workout</a>
          <a className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer" onClick={handleNavClick("/progress")}>Progress</a>
          <a className="text-on-surface-variant font-medium hover:text-on-surface font-body-md text-body-md transition-colors pb-1 cursor-pointer" onClick={handleNavClick("/insights")}>Insights</a>
        </nav>
        <div className="flex items-center gap-4">
          <button className="hidden md:flex text-on-surface hover:bg-surface-container-low transition-colors p-2 rounded-full scale-95 active:opacity-80 transition-transform">
            <span className="material-symbols-outlined">search</span>
          </button>
          <Link href="/login" className="text-on-surface hover:bg-surface-container-low transition-colors p-2 rounded-full scale-95 active:opacity-80 transition-transform">
            <span className="material-symbols-outlined">account_circle</span>
          </Link>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center pt-24 pb-32 px-margin-mobile md:px-margin-desktop w-full max-w-container-max mx-auto gap-24">
        {/* Hero Section */}
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

        {/* Product UI Preview (Bento Grid) */}
        <section className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[240px]">
          {/* Main Chart Card */}
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
          {/* Stats Card */}
          <div className="md:col-span-4 row-span-1 border border-outline-variant rounded-xl p-6 bg-surface flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300">
            <div className="flex justify-between items-center">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Next Session</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">fitness_center</span>
            </div>
            <div>
              <h4 className="font-headline-lg-mobile text-headline-lg-mobile text-primary font-semibold">Hypertrophy B</h4>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">Est. 65 mins</p>
            </div>
          </div>
          {/* AI Insight Card */}
          <div className="md:col-span-4 row-span-1 border border-secondary/20 rounded-xl p-6 bg-secondary-fixed/30 flex flex-col justify-between hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/10 blur-2xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(70,72,212,0.6)]"></div>
              <span className="font-label-caps text-label-caps text-secondary font-semibold uppercase tracking-wider">AI Insight</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed text-sm">
              Recovery indicates you can push harder on primary compound lifts today. Consider a 5% load increase.
            </p>
          </div>
        </section>

        {/* SECTION 01 — INTRODUCTION */}
        <section className="w-full flex flex-col md:flex-row pt-24 pb-12 gap-12 border-t border-outline-variant mt-12">
          <div className="md:w-1/3">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">About Striv</h2>
          </div>
          <div className="md:w-2/3 flex flex-col gap-6">
            <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
              Training is more than numbers.
            </h3>
            <p className="font-body-md text-body-md md:text-xl text-on-surface-variant max-w-2xl text-balance">
              Every set, every rep, every moment of exertion builds a larger narrative. We believe that to truly improve, you need to see the whole picture.
            </p>
          </div>
        </section>

        {/* SECTION 02 — THE PROBLEM */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-16 border-t border-outline-variant">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-1/3">
              <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">The Problem</h2>
            </div>
            <div className="md:w-2/3">
              <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
                More data doesn&apos;t always mean more understanding.
              </h3>
            </div>
          </div>
          <div className="relative w-full h-[400px] border border-outline-variant rounded-xl bg-surface flex flex-wrap content-center justify-center gap-4 p-8 overflow-hidden">
            <div className="absolute inset-0 opacity-10 flex items-center justify-center pointer-events-none">
              <svg className="stroke-primary" fill="none" height="100%" width="100%">
                <line strokeDasharray="4 4" strokeWidth="1" x1="10%" x2="90%" y1="20%" y2="80%" />
                <line strokeDasharray="4 4" strokeWidth="1" x1="20%" x2="80%" y1="80%" y2="20%" />
                <circle cx="50%" cy="50%" r="20%" strokeDasharray="4 4" strokeWidth="1" />
              </svg>
            </div>
            {["SETS", "REPS", "WEIGHT", "VOLUME", "FREQUENCY", "CONSISTENCY"].map((label, i) => (
              <div key={label} className={`px-6 py-3 border border-outline-variant rounded-full text-on-surface font-metric-sm text-metric-sm bg-surface shadow-sm z-10 ${
                i === 1 ? "translate-y-4" : i === 2 ? "-translate-y-4" : i === 3 ? "translate-y-2" : i === 4 ? "-translate-y-6" : ""
              }`}>{label}</div>
            ))}
          </div>
        </section>

        {/* SECTION 03 — THE STRIV APPROACH */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-16 border-t border-outline-variant">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-1/3">
              <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">The Striv Approach</h2>
            </div>
            <div className="md:w-2/3">
              <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
                Turn training data into something you can understand.
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-8 border-t border-outline-variant">
            {[
              { num: "01", title: "Track", desc: "Log every detail of your workout with precision and ease. Our interface stays out of your way." },
              { num: "02", title: "Understand", desc: "See the patterns in your history. Striv connects the dots between your sessions." },
              { num: "03", title: "Improve", desc: "Train with clarity. Use intelligent insights to guide your next macrocycle." },
            ].map(step => (
              <div key={step.num} className="flex flex-col gap-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">{step.num} {step.title}</span>
                <p className="font-body-md text-body-md text-on-surface-variant">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 04 — HOW IT WORKS */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-16 border-t border-outline-variant">
          <div className="flex flex-col text-center gap-6">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">How It Works</h2>
            <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance mx-auto">
              From workout to insight.
            </h3>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 relative pt-12">
            <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-[1px] bg-outline-variant w-2/3 mx-auto z-0"></div>
            {[
              { num: "01", title: "Train", desc: "Log workout" },
              { num: "02", title: "Analyze", desc: "Process history" },
              { num: "03", title: "Understand", desc: "Meaningful patterns" },
            ].map(step => (
              <div key={step.num} className="flex flex-col items-center text-center gap-4 w-full md:w-1/3 z-10">
                <div className="w-8 h-8 rounded-full bg-surface border border-outline-variant flex items-center justify-center font-metric-sm text-metric-sm text-primary">{step.num}</div>
                <h4 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-primary">{step.title}</h4>
                <p className="font-body-md text-body-md text-on-surface-variant">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 05 — STRIV INTELLIGENCE */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-12 border-t border-outline-variant">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-1/3">
              <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Striv Intelligence</h2>
            </div>
            <div className="md:w-2/3">
              <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
                Your data tells a story. Striv helps you read it.
              </h3>
            </div>
          </div>
          <div className="w-full bg-surface-container-low rounded-xl p-8 md:p-16 flex items-center justify-center border border-outline-variant relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-surface/50 to-transparent"></div>
            <div className="z-10 bg-surface border border-outline-variant p-6 rounded-xl shadow-lg max-w-sm w-full flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">psychology</span>
                <span className="font-label-caps text-label-caps text-secondary font-semibold uppercase tracking-wider">AI Insight</span>
              </div>
              <p className="font-body-md text-body-md text-primary font-medium">Your strength is trending upward.</p>
            </div>
          </div>
        </section>

        {/* SECTION 06 — WHY STRIV */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-16 border-t border-outline-variant">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-1/3">
              <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Why Striv</h2>
            </div>
            <div className="md:w-2/3">
              <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
                Train with context, not just numbers.
              </h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-outline-variant pt-12">
            {[
              { num: "1", title: "Clarity" },
              { num: "2", title: "Consistency" },
              { num: "3", title: "Evidence" },
            ].map(item => (
              <div key={item.num} className="flex flex-col gap-4">
                <span className="font-metric-display text-[72px] font-black text-outline-variant/30 leading-none">{item.num}</span>
                <h4 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-primary uppercase tracking-tight">{item.title}</h4>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 07 — PRODUCT SHOWCASE */}
        <section className="w-full pt-24 pb-12 flex flex-col gap-12 border-t border-outline-variant">
          <div className="text-center">
            <h3 className="font-metric-display text-metric-display md:text-[56px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
              Everything about your training, in one place.
            </h3>
          </div>
          <div className="relative w-full h-[600px] flex items-center justify-center mt-8">
            <div className="absolute w-3/4 max-w-2xl bg-surface border border-outline-variant rounded-xl shadow-lg p-2 z-10 -translate-x-12 -translate-y-8">
              <div className="w-full h-full bg-surface-container-low rounded-lg aspect-[4/3] flex items-center justify-center text-outline-variant font-label-caps">Dashboard UI Placeholder</div>
            </div>
            <div className="absolute w-3/4 max-w-2xl bg-surface border border-outline-variant rounded-xl shadow-xl p-2 z-20 translate-x-12 translate-y-8">
              <div className="w-full h-full bg-surface-container-lowest rounded-lg aspect-[4/3] flex items-center justify-center text-outline-variant font-label-caps">Progress Analytics UI Placeholder</div>
            </div>
          </div>
        </section>

        {/* SECTION 08 — FINAL CTA */}
        <section className="w-full py-32 flex flex-col items-center text-center gap-8 border-t border-outline-variant mt-12">
          <h2 className="font-metric-display text-metric-display md:text-[72px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
            Start understanding your training.
          </h2>
          <p className="font-body-md text-body-md md:text-xl text-on-surface-variant max-w-2xl text-balance">
            Track every session. Understand your progress. Train with more clarity.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full sm:w-auto">
            <Link href="/register" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-lg hover:bg-primary/90 transition-colors shadow-sm active:scale-95 duration-200">
              Start Tracking
            </Link>
            <Link href="/register" className="bg-surface text-primary border border-outline font-metric-sm text-metric-sm px-8 py-4 rounded-lg hover:bg-surface-container-low transition-colors active:scale-95 duration-200">
              Explore Striv
            </Link>
          </div>
        </section>

        {/* SECTION 09 — CONTACT */}
        <section className="w-full pt-24 pb-24 flex flex-col md:flex-row gap-16 border-t border-outline-variant">
          <div className="md:w-1/2 flex flex-col gap-6">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Get in Touch</h2>
            <h3 className="font-metric-display text-metric-display md:text-[48px] md:leading-[1.1] font-bold text-primary tracking-tighter text-balance">
              Have a question about Striv?
            </h3>
          </div>
          <div className="md:w-1/2">
            <form className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant">Name</label>
                <input className="bg-surface border border-outline-variant rounded-lg p-3 font-body-md focus:outline-none focus:border-primary" type="text" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant">Email</label>
                <input className="bg-surface border border-outline-variant rounded-lg p-3 font-body-md focus:outline-none focus:border-primary" type="email" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-label-caps text-on-surface-variant">Message</label>
                <textarea className="bg-surface border border-outline-variant rounded-lg p-3 font-body-md focus:outline-none focus:border-primary min-h-[120px]" rows={4} />
              </div>
              <button className="bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors shadow-sm self-start">
                Send Message
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 border-t border-outline-variant bg-surface flex flex-col gap-12">
        <div className="flex flex-col md:flex-row justify-between gap-12 px-margin-mobile md:px-margin-desktop">
          <div className="flex flex-col gap-4">
            <span className="font-headline-lg-mobile font-black text-primary tracking-tighter">Striv</span>
            <p className="font-body-md text-on-surface-variant">Your training has a story.</p>
          </div>
          <div className="flex gap-16 font-body-md text-on-surface-variant">
            <div className="flex flex-col gap-4">
              <Link className="hover:text-primary transition-colors" href="/">Overview</Link>
              <Link className="hover:text-primary transition-colors" href="/workout">Workout</Link>
              <Link className="hover:text-primary transition-colors" href="/progress">Progress</Link>
              <Link className="hover:text-primary transition-colors" href="/insights">Insights</Link>
            </div>
            <div className="flex flex-col gap-4">
              <Link className="hover:text-primary transition-colors" href="/goals">Goals</Link>
              <Link className="hover:text-primary transition-colors" href="/records">Records</Link>
            </div>
          </div>
        </div>
        <div className="pt-8 border-t border-outline-variant/50 text-on-surface-variant font-label-caps text-label-caps text-center">
          © 2026 Striv. All rights reserved.
        </div>
      </footer>
    </div>
  );
}