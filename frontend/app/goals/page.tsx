"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Exercise = { id: number; name: string; slug: string };
type GoalProgress = { current_value: number; progress_percentage: number };
type Goal = {
  id: number;
  exercise_id: number;
  exercise: Exercise;
  target_type: string;
  target_value: number;
  target_reps: number | null;
  deadline: string | null;
  status: string;
};

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progressByGoal, setProgressByGoal] = useState<Record<number, GoalProgress>>({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [updating, setUpdating] = useState(false);

  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseResults, setExerciseResults] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [targetType, setTargetType] = useState("weight");
  const [targetValue, setTargetValue] = useState("");
  const [targetReps, setTargetReps] = useState("");
  const [deadline, setDeadline] = useState("");
  const [statusValue, setStatusValue] = useState("active");
  const [formError, setFormError] = useState("");

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await apiClient.get<{ data: Goal[] }>(`/goals?${params.toString()}`);
      setGoals(res.data);
      setError("");
      // Fetch progress for each goal in parallel (best-effort)
      const list = res.data ?? [];
      if (list.length > 0) {
        Promise.all(
          list.map((g) =>
            apiClient
              .get<GoalProgress>(`/goals/${g.id}/progress`)
              .catch(() => null)
          )
        ).then((results) => {
          setProgressByGoal((prev) => {
            const next = { ...prev };
            list.forEach((g, i) => {
              const r = results[i];
              if (r && typeof r.progress_percentage === "number") {
                next[g.id] = r;
              }
            });
            return next;
          });
        });
      }
    } catch (e: any) {
      if (e.status === 401) router.push("/login");
      setError(e.message || "Could not load goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, [filter]);

  const searchExercises = async (q: string) => {
    if (!q.trim()) { setExerciseResults([]); return; }
    try {
      const res = await apiClient.get<{ data: Exercise[] }>(`/exercises?search=${encodeURIComponent(q)}`);
      setExerciseResults(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const timer = setTimeout(() => searchExercises(exerciseSearch), 300);
    return () => clearTimeout(timer);
  }, [exerciseSearch]);

  const createGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!selectedExercise) { setFormError("Select an exercise"); return; }
    if (!targetValue || parseFloat(targetValue) <= 0) { setFormError("Target value must be >0"); return; }
    setSubmitting(true);
    try {
      await apiClient.post("/goals", {
        exercise_id: selectedExercise.id,
        target_type: targetType,
        target_value: parseFloat(targetValue),
        target_reps: targetReps ? parseInt(targetReps) : null,
        deadline: deadline || null,
        status: "active",
      });
      setShowModal(false);
      resetForm();
      fetchGoals();
    } catch (e: any) {
      setFormError(e.message || "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteGoal = async (id: number) => {
    if (!confirm("Delete this goal?")) return;
    try {
      await apiClient.delete(`/goals/${id}`);
      fetchGoals();
    } catch (e: any) {
      alert(e.message || "Delete failed");
    }
  };

  const resetForm = () => {
    setExerciseSearch("");
    setExerciseResults([]);
    setSelectedExercise(null);
    setTargetType("weight");
    setTargetValue("");
    setTargetReps("");
    setDeadline("");
    setStatusValue("active");
    setFormError("");
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setSelectedExercise(goal.exercise);
    setExerciseSearch(goal.exercise.name);
    setTargetType(goal.target_type);
    setTargetValue(String(goal.target_value));
    setTargetReps(goal.target_reps ? String(goal.target_reps) : "");
    setDeadline(goal.deadline ? goal.deadline.substring(0, 10) : "");
    setStatusValue(goal.status);
    setFormError("");
  };

  const closeEdit = () => {
    setEditingGoal(null);
    resetForm();
  };

  const updateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;
    setFormError("");
    if (!targetValue || parseFloat(targetValue) <= 0) {
      setFormError("Target value must be >0");
      return;
    }
    setUpdating(true);
    try {
      await apiClient.put(`/goals/${editingGoal.id}`, {
        target_type: targetType,
        target_value: parseFloat(targetValue),
        target_reps: targetReps ? parseInt(targetReps) : null,
        deadline: deadline || null,
        status: statusValue,
      });
      closeEdit();
      fetchGoals();
    } catch (e: any) {
      setFormError(e.message || "Failed to update goal");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-headline-lg font-headline-lg text-primary">Goals</h1>
          <button
            onClick={() => setShowModal(true)}
            className="bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm hover:bg-primary/90 transition-colors"
          >
            New Goal
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {["all", "active", "completed", "abandoned"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-xl font-label-caps text-label-caps transition-colors ${
                filter === s
                  ? "bg-primary text-on-primary"
                  : "bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 bg-error-container rounded-xl text-on-error-container text-center">
            <p>{error}</p>
            <button onClick={fetchGoals} className="mt-2 text-primary font-semibold hover:underline">
              Retry
            </button>
          </div>
        ) : goals.length === 0 ? (
          <div className="border border-dashed border-outline-variant rounded-xl p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-outline block mb-4">flag</span>
            <p className="font-headline-lg-mobile text-primary">No goals yet.</p>
            <p className="font-body-md text-on-surface-variant mt-1">Set a goal to track your progress.</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-6 bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm hover:bg-primary/90 transition-colors"
            >
              New Goal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map((goal) => {
              const progress = progressByGoal[goal.id];
              const pct = progress?.progress_percentage;
              const widthPct = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
              const showCurrent = typeof progress?.current_value === "number" && goal.target_type !== "workouts";
              const unit =
                goal.target_type === "weight" || goal.target_type === "one_rm"
                  ? "kg"
                  : goal.target_type === "reps"
                  ? "reps"
                  : "";
              const currentValText =
                typeof progress?.current_value === "number"
                  ? progress.current_value % 1 === 0
                    ? String(progress.current_value)
                    : progress.current_value.toFixed(1)
                  : null;
              return (
                <div key={goal.id} className="border border-outline-variant rounded-xl p-5 bg-surface-container-lowest">
                  <div className="flex justify-between items-start">
                    <h3 className="font-headline-lg-mobile text-primary">{goal.exercise.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(goal)}
                        className="text-on-surface-variant hover:text-primary transition-colors p-1"
                        aria-label="Edit goal"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1"
                        aria-label="Delete goal"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                  <p className="font-body-md text-on-surface-variant mt-1">
                    {goal.target_type === "weight" && `${goal.target_value} kg`}
                    {goal.target_type === "reps" && `${goal.target_value} reps`}
                    {goal.target_type === "one_rm" && `${goal.target_value} kg 1RM`}
                    {goal.target_type === "workouts" && `${goal.target_value} workouts`}
                    {goal.target_reps ? ` × ${goal.target_reps} reps` : ""}
                  </p>
                  <div className="mt-3">
                    <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                      {typeof pct === "number" ? (
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${widthPct}%` }}
                        />
                      ) : (
                        <div className="bg-surface-container-high h-full rounded-full animate-pulse" style={{ width: "100%" }} />
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-on-surface-variant">
                        {typeof pct === "number" ? `${pct}%` : "—"}
                      </span>
                      {showCurrent && currentValText !== null && (
                        <span className="text-xs text-on-surface-variant">
                          {currentValText} / {goal.target_value} {unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`mt-3 inline-block px-2 py-0.5 rounded text-xs font-label-caps ${
                      goal.status === "active" ? "bg-secondary/10 text-secondary" :
                      goal.status === "completed" ? "bg-primary/10 text-primary" :
                      "bg-error/10 text-error"
                    }`}
                  >
                    {goal.status.charAt(0).toUpperCase() + goal.status.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); setEditingGoal(null); }}>
          <div className="bg-surface rounded-xl border border-outline-variant p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-headline-lg text-headline-lg text-primary mb-4">New Goal</h2>
            <form onSubmit={createGoal} className="space-y-4">
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Exercise</label>
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={e => setExerciseSearch(e.target.value)}
                  placeholder="Search exercise..."
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                />
                {exerciseResults.length > 0 && (
                  <ul className="mt-1 border border-outline-variant rounded-lg max-h-40 overflow-y-auto bg-surface">
                    {exerciseResults.map(ex => (
                      <li
                        key={ex.id}
                        className="px-4 py-2 hover:bg-surface-container-low cursor-pointer"
                        onClick={() => {
                          setSelectedExercise(ex);
                          setExerciseSearch(ex.name);
                          setExerciseResults([]);
                        }}
                      >
                        {ex.name}
                      </li>
                    ))}
                  </ul>
                )}
                {selectedExercise && <p className="text-sm text-on-surface-variant mt-1">Selected: {selectedExercise.name}</p>}
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Type</label>
                <select
                  value={targetType}
                  onChange={e => setTargetType(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                >
                  <option value="weight">Weight (kg)</option>
                  <option value="reps">Reps</option>
                  <option value="one_rm">1RM (kg)</option>
                  <option value="workouts">Workouts</option>
                </select>
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Value</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Reps (optional)</label>
                <input
                  type="number"
                  value={targetReps}
                  onChange={e => setTargetReps(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                />
              </div>
              {formError && <p className="text-error text-sm">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingGoal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeEdit}>
          <div className="bg-surface rounded-xl border border-outline-variant p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Edit Goal</h2>
            <form onSubmit={updateGoal} className="space-y-4">
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Exercise</label>
                <input
                  type="text"
                  value={exerciseSearch}
                  readOnly
                  aria-readonly="true"
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface-container-low text-on-surface-variant cursor-not-allowed focus:outline-none"
                />
                <p className="text-sm text-on-surface-variant mt-1">Exercise can&apos;t be changed</p>
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Type</label>
                <select
                  value={targetType}
                  onChange={e => setTargetType(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                >
                  <option value="weight">Weight (kg)</option>
                  <option value="reps">Reps</option>
                  <option value="one_rm">1RM (kg)</option>
                  <option value="workouts">Workouts</option>
                </select>
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Value</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={e => setTargetValue(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Target Reps (optional)</label>
                <input
                  type="number"
                  value={targetReps}
                  onChange={e => setTargetReps(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Status</label>
                <select
                  value={statusValue}
                  onChange={e => setStatusValue(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </div>
              {formError && <p className="text-error text-sm">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}