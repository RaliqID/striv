"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  age: number | null;
  location: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  experience_level: string | null;
  primary_goal: string | null;
  training_frequency: number | null;
};

type User = {
  name: string;
  email: string;
  profile: Profile | null;
};

const experienceLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const goalLabels: Record<string, string> = {
  muscle: "Build Muscle",
  strength: "Get Stronger",
  endurance: "Conditioning",
};

const fmtNum = (n: number | null, unit: string) => {
  if (n == null) return "—";
  // Preserve 1 decimal for kg, integer for others
  const display = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return `${display} ${unit}`;
};

const fmtAge = (n: number | null) => (n == null ? "—" : `${n} years`);
const fmtFreq = (n: number | null) => (n == null ? "—" : `${n} days/week`);

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ user: User }>("/profile");
      setUser(res.user);
      setError("");
    } catch (e: any) {
      if (e.status === 401) {
        router.push("/login");
        return;
      }
      setError(e.message || "Could not load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Revoke token server-side (best-effort — clear local state even if it fails)
      await apiClient.post("/auth/logout", {});
    } catch {
      // Token may already be invalid — proceed with local cleanup
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("activeSessionId");
      window.location.href = "/login";
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-headline-lg text-headline-lg text-primary">Profile</h1>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-surface-variant animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-40 rounded bg-surface-container animate-pulse" />
                <div className="h-4 w-56 rounded bg-surface-container animate-pulse" />
              </div>
            </div>
            <div className="h-px bg-outline-variant" />
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-20 rounded bg-surface-container animate-pulse" />
                  <div className="h-5 w-32 rounded bg-surface-container animate-pulse" />
                </div>
              ))}
            </div>
            <div className="h-px bg-outline-variant" />
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-20 rounded bg-surface-container animate-pulse" />
                  <div className="h-5 w-32 rounded bg-surface-container animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-6 bg-error-container rounded-xl text-on-error-container text-center">
            <p>{error}</p>
            <button onClick={fetchProfile} className="mt-2 text-primary font-semibold">
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-surface-variant flex items-center justify-center font-metric-display text-2xl text-on-surface">
                {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0">
                <p className="font-headline-lg text-headline-lg text-primary truncate">
                  {user?.name || "—"}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant truncate">
                  {user?.email || "—"}
                </p>
              </div>
            </div>

            <div className="border-t border-outline-variant" />

            {/* Biodata */}
            <section className="space-y-4">
              <h2 className="font-metric-sm text-metric-sm text-primary">Biodata</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Age</p>
                  <p className="font-body-md text-body-md text-on-surface">{fmtAge(user?.profile?.age ?? null)}</p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Location</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.location || "—"}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Weight</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.weight_kg ?? null, "kg")}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Height</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.height_cm ?? null, "cm")}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Target Weight</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.target_weight_kg ?? null, "kg")}
                  </p>
                </div>
              </div>
            </section>

            <div className="border-t border-outline-variant" />

            {/* Training Profile */}
            <section className="space-y-4">
              <h2 className="font-metric-sm text-metric-sm text-primary">Training Profile</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Experience</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.experience_level
                      ? experienceLabels[user.profile.experience_level] || "—"
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Primary Goal</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.primary_goal
                      ? goalLabels[user.profile.primary_goal] || "—"
                      : "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">Training Frequency</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtFreq(user?.profile?.training_frequency ?? null)}
                  </p>
                </div>
              </div>
            </section>

            <div className="pt-2 flex items-center gap-4">
              <button
                onClick={() => router.push("/settings")}
                className="bg-primary text-on-primary rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
              >
                Edit Profile
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-error border border-error/30 rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-error/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                {signingOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
