"use client";

import AppLayout from "@/components/AppLayout";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { apiClient, apiUrl } from "@/lib/api";
import type { Unit } from "@/lib/units";
import { useState, useEffect } from "react";
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
  preferences?: { unit?: Unit } | null;
};

type User = {
  name: string;
  email: string;
  profile: Profile | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Biodata form state
  const [bioForm, setBioForm] = useState({
    age: "" as string,
    location: "",
    weight_kg: "" as string,
    height_cm: "" as string,
    target_weight_kg: "" as string,
  });
  const [bioSaving, setBioSaving] = useState(false);
  const [bioMsg, setBioMsg] = useState("");

  // Training form state
  const [trainingForm, setTrainingForm] = useState({
    experience_level: "" as string,
    primary_goal: "" as string,
    training_frequency: "" as string,
  });
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [trainingMsg, setTrainingMsg] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitMsg, setUnitMsg] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [exporting, setExporting] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ user: User }>("/profile");
      setUser(res.user);
      const p = res.user.profile;
      setBioForm({
        age: p?.age != null ? String(p.age) : "",
        location: p?.location ?? "",
        weight_kg: p?.weight_kg != null ? String(p.weight_kg) : "",
        height_cm: p?.height_cm != null ? String(p.height_cm) : "",
        target_weight_kg: p?.target_weight_kg != null ? String(p.target_weight_kg) : "",
      });
      setTrainingForm({
        experience_level: p?.experience_level ?? "",
        primary_goal: p?.primary_goal ?? "",
        training_frequency: p?.training_frequency != null ? String(p.training_frequency) : "",
      });
      setUnit(p?.preferences?.unit || "kg");
      setError("");
    } catch (e: any) {
      if (e.status === 401) router.push("/login");
      setError(e.message || "Could not load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Persist the display unit.
   *
   * Stored under profile.preferences so it travels with the account rather
   * than living only in the browser.
   */
  const changeUnit = async (next: Unit) => {
    if (next === unit || unitSaving) return;

    const previous = unit;
    setUnit(next); // optimistic — the toggle should feel instant
    setUnitSaving(true);
    setUnitMsg("");
    try {
      await apiClient.put("/profile", {
        preferences: { ...(user?.profile?.preferences ?? {}), unit: next },
      });
      // Keep the cached user in sync so other pages read the new unit.
      const stored = localStorage.getItem("user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          parsed.profile = {
            ...(parsed.profile ?? {}),
            preferences: { ...(parsed.profile?.preferences ?? {}), unit: next },
          };
          localStorage.setItem("user", JSON.stringify(parsed));
        } catch {
          /* ignore malformed cache */
        }
      }
      setUnitMsg(`Weights now display in ${next}.`);
    } catch (caught) {
      setUnit(previous); // roll back on failure
      setUnitMsg(caught instanceof Error ? caught.message : "Could not save the unit.");
    } finally {
      setUnitSaving(false);
    }
  };

  /** Download every workout the member has logged as CSV. */
  const exportData = async () => {
    setExporting(true);
    setUnitMsg("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(apiUrl("/profile/export"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `striv-data-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword) {
      setError("Enter your password to confirm account deletion.");
      return;
    }
    setDeleteBusy(true);
    try {
      // apiClient.delete sends no body; this endpoint needs the password as
      // proof of intent, so the raw helper is used with an explicit body.
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/profile"), {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: deletePassword }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.errors?.password?.[0] ?? payload?.message ?? "Could not delete your account."
        );
      }

      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete your account.");
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  };

  const saveBiodata = async (e: React.FormEvent) => {
    e.preventDefault();
    setBioSaving(true);
    setBioMsg("");
    try {
      const payload = {
        age: bioForm.age === "" ? null : parseInt(bioForm.age, 10),
        location: bioForm.location.trim() === "" ? null : bioForm.location.trim(),
        weight_kg: bioForm.weight_kg === "" ? null : parseFloat(bioForm.weight_kg),
        height_cm: bioForm.height_cm === "" ? null : parseFloat(bioForm.height_cm),
        target_weight_kg: bioForm.target_weight_kg === "" ? null : parseFloat(bioForm.target_weight_kg),
      };
      await apiClient.put("/profile", payload);
      // refresh local user state
      setUser((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                age: payload.age,
                location: payload.location,
                weight_kg: payload.weight_kg,
                height_cm: payload.height_cm,
                target_weight_kg: payload.target_weight_kg,
                experience_level: prev.profile?.experience_level ?? null,
                primary_goal: prev.profile?.primary_goal ?? null,
                training_frequency: prev.profile?.training_frequency ?? null,
              },
            }
          : prev
      );
      setBioMsg("Saved.");
      setTimeout(() => setBioMsg(""), 3000);
    } catch (e: any) {
      setBioMsg("Error: " + (e.message || "Save failed"));
    } finally {
      setBioSaving(false);
    }
  };

  const saveTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrainingSaving(true);
    setTrainingMsg("");
    try {
      const payload = {
        experience_level: trainingForm.experience_level === "" ? null : trainingForm.experience_level,
        primary_goal: trainingForm.primary_goal === "" ? null : trainingForm.primary_goal,
        training_frequency:
          trainingForm.training_frequency === "" ? null : parseInt(trainingForm.training_frequency, 10),
      };
      await apiClient.put("/profile", payload);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                age: prev.profile?.age ?? null,
                location: prev.profile?.location ?? null,
                weight_kg: prev.profile?.weight_kg ?? null,
                height_cm: prev.profile?.height_cm ?? null,
                target_weight_kg: prev.profile?.target_weight_kg ?? null,
                experience_level: payload.experience_level,
                primary_goal: payload.primary_goal,
                training_frequency: payload.training_frequency,
              },
            }
          : prev
      );
      setTrainingMsg("Saved.");
      setTimeout(() => setTrainingMsg(""), 3000);
    } catch (e: any) {
      setTrainingMsg("Error: " + (e.message || "Save failed"));
    } finally {
      setTrainingSaving(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="font-headline-lg text-headline-lg text-primary">Settings</h1>

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 rounded-xl bg-surface-container animate-pulse" />
            <div className="h-60 rounded-xl bg-surface-container animate-pulse" />
            <div className="h-60 rounded-xl bg-surface-container animate-pulse" />
          </div>
        ) : error ? (
          <div className="p-6 bg-error-container rounded-xl text-on-error-container text-center">
            <p>{error}</p>
            <button onClick={fetchProfile} className="mt-2 text-primary font-semibold">Retry</button>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {/* Account */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-4">Account</h2>
              <div className="space-y-1">
                <p className="font-body-md text-on-surface"><span className="font-medium">Name:</span> {user?.name || "—"}</p>
                <p className="font-body-md text-on-surface"><span className="font-medium">Email:</span> {user?.email || "—"}</p>
              </div>
              <button onClick={signOut} className="mt-4 text-error border border-error/30 rounded-lg px-4 py-2 hover:bg-error/5">
                Sign Out
              </button>
            </div>

            {/* Biodata */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-4">Biodata</h2>
              <form onSubmit={saveBiodata} className="space-y-4">
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Age</label>
                  <input
                    type="number"
                    min={13}
                    max={100}
                    value={bioForm.age}
                    onChange={(e) => setBioForm({ ...bioForm, age: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                    placeholder="e.g. 24"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Location</label>
                  <input
                    type="text"
                    maxLength={255}
                    value={bioForm.location}
                    onChange={(e) => setBioForm({ ...bioForm, location: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                    placeholder="e.g. Jakarta, ID"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={20}
                    max={400}
                    value={bioForm.weight_kg}
                    onChange={(e) => setBioForm({ ...bioForm, weight_kg: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                    placeholder="e.g. 70.5"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Height (cm)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={100}
                    max={250}
                    value={bioForm.height_cm}
                    onChange={(e) => setBioForm({ ...bioForm, height_cm: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                    placeholder="e.g. 175"
                  />
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Weight (kg)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={20}
                    max={400}
                    value={bioForm.target_weight_kg}
                    onChange={(e) => setBioForm({ ...bioForm, target_weight_kg: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                    placeholder="e.g. 72"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <button type="submit" disabled={bioSaving} className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    {bioSaving ? "Saving..." : "Save"}
                  </button>
                  {bioMsg && (
                    <span className={`text-sm ${bioMsg.startsWith("Error") ? "text-error" : "text-secondary"}`}>
                      {bioMsg}
                    </span>
                  )}
                </div>
              </form>
            </div>

            {/* Training Profile */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-4">Training Profile</h2>
              <form onSubmit={saveTraining} className="space-y-4">
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Experience</label>
                  <select
                    value={trainingForm.experience_level}
                    onChange={(e) => setTrainingForm({ ...trainingForm, experience_level: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                  >
                    <option value="">Select</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Primary Goal</label>
                  <select
                    value={trainingForm.primary_goal}
                    onChange={(e) => setTrainingForm({ ...trainingForm, primary_goal: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                  >
                    <option value="">Select</option>
                    <option value="muscle">Build Muscle</option>
                    <option value="strength">Get Stronger</option>
                    <option value="endurance">Conditioning</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Training Frequency (days/week)</label>
                  <select
                    value={trainingForm.training_frequency}
                    onChange={(e) => setTrainingForm({ ...trainingForm, training_frequency: e.target.value })}
                    className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary"
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <button type="submit" disabled={trainingSaving} className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50">
                    {trainingSaving ? "Saving..." : "Save"}
                  </button>
                  {trainingMsg && (
                    <span className={`text-sm ${trainingMsg.startsWith("Error") ? "text-error" : "text-secondary"}`}>
                      {trainingMsg}
                    </span>
                  )}
                </div>
              </form>
            </div>

            {/* Units */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-2">Units</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                Choose how weights are displayed throughout the app. Your data is always stored in
                kilograms.
              </p>
              <div className="flex items-center gap-4">
                <span className={`font-body-md ${unit === "kg" ? "text-primary font-semibold" : "text-on-surface-variant"}`}>
                  kg
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={unit === "lbs"}
                  aria-label="Display weights in pounds"
                  disabled={unitSaving}
                  onClick={() => changeUnit(unit === "kg" ? "lbs" : "kg")}
                  className={`relative h-6 w-12 rounded-full transition-colors disabled:opacity-60 ${
                    unit === "lbs" ? "bg-primary" : "bg-surface-container-high"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${
                      unit === "lbs" ? "left-7" : "left-1"
                    }`}
                  />
                </button>
                <span className={`font-body-md ${unit === "lbs" ? "text-primary font-semibold" : "text-on-surface-variant"}`}>
                  lbs
                </span>
              </div>
              {unitMsg && (
                <p role="status" className="mt-3 font-body-md text-body-md text-on-surface-variant">
                  {unitMsg}
                </p>
              )}
            </div>

            {/* Data */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-2">Data</h2>
              <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                Download everything you have logged, or permanently remove your account.
              </p>
              <div className="flex gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={exportData}
                  disabled={exporting}
                  className="border border-outline-variant rounded-lg px-4 py-2 hover:bg-surface-container-low transition-colors disabled:opacity-50"
                >
                  {exporting ? "Preparing…" : "Export my data"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="border border-error/30 text-error rounded-lg px-4 py-2 hover:bg-error/5 transition-colors"
                >
                  Delete account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        description={
          <>
            This permanently deletes your profile, every workout, goal and conversation. It cannot be
            undone.
          </>
        }
        confirmLabel="Delete permanently"
        busy={deleteBusy}
        onConfirm={deleteAccount}
        onCancel={() => {
          setDeleteOpen(false);
          setDeletePassword("");
        }}
        extra={
          <label className="mt-4 block">
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              Confirm your password
            </span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              disabled={deleteBusy}
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
        }
      />
    </AppLayout>
  );
}
