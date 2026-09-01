"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { getUserUnit, type Unit } from "@/lib/units";
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
              <div className="flex items-center gap-4">
                <span className="font-body-md text-on-surface-variant">kg</span>
                <button disabled className="w-12 h-6 bg-surface-container-high rounded-full relative opacity-50 cursor-not-allowed">
                  <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                </button>
                <span className="font-body-md text-on-surface-variant opacity-50">lbs</span>
                <span className="text-xs text-on-surface-variant ml-2">Coming soon</span>
              </div>
            </div>

            {/* Data */}
            <div className="border border-outline-variant rounded-xl p-6 bg-surface-container-lowest">
              <h2 className="font-metric-sm text-metric-sm text-primary mb-2">Data</h2>
              <div className="flex gap-4 flex-wrap">
                <button disabled className="border border-outline-variant rounded-lg px-4 py-2 opacity-50 cursor-not-allowed hover:bg-surface-container-low" title="Coming soon">Export Data</button>
                <button disabled className="border border-error/30 text-error rounded-lg px-4 py-2 opacity-50 cursor-not-allowed hover:bg-error/5" title="Coming soon">Delete Account</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
