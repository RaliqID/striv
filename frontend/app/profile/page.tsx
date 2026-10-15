"use client";

import AppLayout from "@/components/AppLayout";
import ProfileAvatar from "@/components/ProfileAvatar";
import { apiClient } from "@/lib/api";
import { USER_UPDATED_EVENT } from "@/lib/progression";
import { useTranslation } from "@/lib/i18n/provider";
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
  beginner: "onboarding.expBeginner",
  intermediate: "onboarding.expIntermediate",
  advanced: "onboarding.expAdvanced",
};

const goalLabels: Record<string, string> = {
  muscle: "onboarding.goalMuscle",
  strength: "onboarding.goalStrength",
  endurance: "onboarding.goalEndurance",
};

const fmtNum = (n: number | string | null, unit: string) => {
  if (n == null || n === "") return "—";
  // Backend DECIMAL casts can arrive as strings ("53.00") — coerce first.
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(num)) return "—";
  // Preserve 1 decimal for kg, integer for others
  const display = Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, "");
  return `${display} ${unit}`;
};

const fmtAge = (n: number | null, unit: string) => (n == null ? "-" : `${n} ${unit}`);
const fmtFreq = (n: number | null, unit: string) => (n == null ? "-" : `${n} ${unit}`);

export default function ProfilePage() {
  const { t } = useTranslation();
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
      setError(e.message || t("common.loadFailed"));
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
        <h1 className="font-headline-lg text-headline-lg text-primary">{t("profile.title")}</h1>

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
              {t("action.retry")}
            </button>
          </div>
        ) : (
          <>
            {/*
              Header: photo above, name below, both centred.

              Was a horizontal row (photo beside name), which left the caption
              with nowhere to go but beside the name — and that competed with it.
              Stacking gives the photo its own column, so its caption sits
              directly under the thing it describes and the name gets the full
              width instead of being squeezed by a control.
            */}
            <div className="flex flex-col items-center gap-3">
              <ProfileAvatar
                name={user?.name ?? null}
                avatarUrl={(user as any)?.avatar_url ?? null}
                /*
                 * Passed so the control can disable itself and explain the wait
                 * before the member picks a file. The server enforces the same
                 * limit, so this is courtesy rather than the boundary — but being
                 * told up front is much better than choosing a photo and then
                 * being refused.
                 */
                lockedUntil={(user as any)?.avatar_locked_until ?? null}
                onChanged={(url) => {
                  /*
                   * Built from the current state rather than inside a setUser
                   * updater. React may invoke an updater more than once (it does
                   * so deliberately in StrictMode to surface impurity), and
                   * dispatching a DOM event from one would fire it twice.
                   */
                  const next = { ...(user as any), avatar_url: url };

                  setUser(next);

                  try {
                    localStorage.setItem("user", JSON.stringify(next));
                  } catch {
                    // Storage can be unavailable; the in-memory update stands.
                  }

                  /*
                   * Tell the rest of the chrome.
                   *
                   * The sidebar renders the member's photo but holds its OWN copy
                   * of the user, so without this it keeps showing the old image
                   * until the next full page load — which reads as a failed
                   * upload even though the save succeeded.
                   */
                  window.dispatchEvent(
                    new CustomEvent(USER_UPDATED_EVENT, { detail: { user: next } })
                  );
                }}
              />

              <div className="min-w-0 text-center">
                <p className="font-headline-lg text-headline-lg text-primary">
                  {user?.name || "—"}
                </p>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {user?.email || "—"}
                </p>
              </div>
            </div>

            <div className="border-t border-outline-variant" />

            {/* Biodata */}
            <section className="space-y-4">
              <h2 className="font-metric-sm text-metric-sm text-primary">{t("profile.biodata")}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.age")}</p>
                  <p className="font-body-md text-body-md text-on-surface">{fmtAge(user?.profile?.age ?? null, t("profile.years"))}</p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.location")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.location || "—"}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.weight")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.weight_kg ?? null, "kg")}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.height")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.height_cm ?? null, "cm")}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.targetWeight")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtNum(user?.profile?.target_weight_kg ?? null, "kg")}
                  </p>
                </div>
              </div>
            </section>

            <div className="border-t border-outline-variant" />

            {/* Training Profile */}
            <section className="space-y-4">
              <h2 className="font-metric-sm text-metric-sm text-primary">{t("profile.trainingProfile")}</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.experience")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.experience_level
                      ? t(experienceLabels[user.profile.experience_level] || "-")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.primaryGoal")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {user?.profile?.primary_goal
                      ? t(goalLabels[user.profile.primary_goal] || "-")
                      : "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="font-label-caps text-label-caps text-on-surface-variant">{t("profile.frequency")}</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {fmtFreq(user?.profile?.training_frequency ?? null, t("profile.daysPerWeek"))}
                  </p>
                </div>
              </div>
            </section>

            <div className="pt-2 flex items-center gap-4">
              <button
                onClick={() => router.push("/settings")}
                className="bg-primary text-on-primary rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors"
              >
                {t("profile.editProfile")}
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-error border border-error/30 rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-error/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                {signingOut ? t("action.sending") : t("profile.signOut")}
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
