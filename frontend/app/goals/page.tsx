"use client";

import AppLayout from "@/components/AppLayout";
import Badge from "@/components/admin/Badge";
import Button from "@/components/admin/Button";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/admin/States";
import { apiClient, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/admin";
import { useTranslation } from "@/lib/i18n/provider";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Exercise = { id: number; name: string; slug: string };

type Goal = {
  id: number;
  exercise_id: number | null;
  exercise: Exercise | null;
  target_type: string;
  target_value: number;
  starting_value: number;
  target_reps: number | null;
  deadline: string | null;
  completed_at: string | null;
  status: string;
  unit: string;
  current_value: number;
  progress_percentage: number;
  required_delta: number;
  remaining: number;
};

/** Goal kinds, with the framing each one needs in the form. */
const GOAL_TYPES = [
  {
    value: "weight",
    labelKey: "goals.typeLift",
    hintKey: "goals.typeLiftHint",
    icon: "fitness_center",
  },
  {
    value: "one_rm",
    labelKey: "goals.typeOneRm",
    hintKey: "goals.typeOneRmHint",
    icon: "trending_up",
  },
  {
    value: "reps",
    labelKey: "goals.typeReps",
    hintKey: "goals.typeRepsHint",
    icon: "repeat",
  },
  {
    value: "workouts",
    labelKey: "goals.typeWorkouts",
    hintKey: "goals.typeWorkoutsHint",
    icon: "calendar_month",
  },
];

/** Consistent number rendering: no trailing ".00" on whole numbers. */
function num(value: number | null | undefined): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function GoalsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  // Form state
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseResults, setExerciseResults] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [targetType, setTargetType] = useState("weight");
  const [targetValue, setTargetValue] = useState("");
  const [targetReps, setTargetReps] = useState("");
  const [deadline, setDeadline] = useState("");
  const [statusValue, setStatusValue] = useState("active");

  // Current best for the selected exercise, so the member sees the baseline
  // they are improving on instead of guessing a number and being rejected.
  const [baseline, setBaseline] = useState<number | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await apiClient.get<{ data: Goal[] }>(`/goals?${params}`);
      setGoals(res.data ?? []);
      setError("");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push("/login");
        return;
      }
      setError(caught instanceof Error ? caught.message : t("goals.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [filter, router, t]);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  /** Debounced exercise search. */
  useEffect(() => {
    if (!exerciseSearch.trim()) {
      setExerciseResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ data: Exercise[] }>(
          `/exercises?search=${encodeURIComponent(exerciseSearch)}`
        );
        setExerciseResults(res.data ?? []);
      } catch {
        setExerciseResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [exerciseSearch]);

  /**
   * Fetch the member's current best for the chosen exercise + standard.
   *
   * This is what makes goal setting honest: the form can say "you are at 60kg
   * for 5 reps" and refuse to let them set a target that is not an improvement.
   */
  useEffect(() => {
    if (!selectedExercise || !GOAL_TYPES.some((t) => t.value === targetType) || targetType === "workouts") {
      setBaseline(null);
      return;
    }
    let cancelled = false;
    setBaselineLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          exercise_id: String(selectedExercise.id),
          target_type: targetType,
        });
        if (targetReps) params.set("target_reps", targetReps);
        const res = await apiClient.get<{ current_value: number }>(
          `/goals/baseline?${params}`
        );
        if (!cancelled) setBaseline(res.current_value ?? 0);
      } catch {
        if (!cancelled) setBaseline(null);
      } finally {
        if (!cancelled) setBaselineLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedExercise, targetType, targetReps]);

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
    setBaseline(null);
  };

  const openCreate = () => {
    resetForm();
    setEditingGoal(null);
    setShowModal(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setSelectedExercise(goal.exercise);
    setExerciseSearch(goal.exercise?.name ?? "");
    setTargetType(goal.target_type);
    setTargetValue(String(goal.target_value));
    setTargetReps(goal.target_reps ? String(goal.target_reps) : "");
    setDeadline(goal.deadline ? goal.deadline.substring(0, 10) : "");
    setStatusValue(goal.status);
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
    setEditingGoal(null);
  };

  const submitGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    const parsedTarget = parseFloat(targetValue);
    if (targetType !== "workouts" && !selectedExercise) {
      setFormError(t("goals.errPickExercise"));
      return;
    }
    if (!targetValue || Number.isNaN(parsedTarget) || parsedTarget <= 0) {
      setFormError(t("goals.errAboveZero"));
      return;
    }
    // Mirror the server rule so the member is told before the round trip.
    if (baseline !== null && parsedTarget <= baseline) {
      setFormError(t("goals.errAboveBaseline", { value: num(baseline) }));
      return;
    }

    setSubmitting(true);
    const payload = {
      target_type: targetType,
      target_value: parsedTarget,
      target_reps: targetReps ? parseInt(targetReps, 10) : null,
      deadline: deadline || null,
      ...(targetType === "workouts" ? {} : { exercise_id: selectedExercise?.id }),
    };

    try {
      if (editingGoal) {
        await apiClient.put(`/goals/${editingGoal.id}`, {
          ...payload,
          status: statusValue,
        });
      } else {
        await apiClient.post("/goals", payload);
      }
      closeModal();
      void fetchGoals();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : t("goals.errSave"));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await apiClient.delete(`/goals/${deleteTarget.id}`);
      setDeleteTarget(null);
      void fetchGoals();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("goals.errDelete"));
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: goals.length,
      active: goals.filter((goal) => goal.status === "active").length,
      completed: goals.filter((goal) => goal.status === "completed").length,
    }),
    [goals]
  );

  const selectedType = GOAL_TYPES.find((type) => type.value === targetType);
  const unitLabel =
    targetType === "workouts"
      ? t("goals.unitWorkouts")
      : targetType === "reps"
        ? t("goals.unitReps")
        : t("goals.unitKg");

  return (
    <AppLayout>
        <div className="mx-auto w-full max-w-container-max min-w-0 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-primary">{t("goals.title")}</h1>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                {t("goals.subtitle")}
              </p>
            </div>
            <Button icon="add" onClick={openCreate}>
              {t("goals.new")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: `${t("goals.filterAll")} (${counts.all})` },
              { value: "active", label: `${t("goals.filterActive")} (${counts.active})` },
              { value: "completed", label: `${t("goals.filterCompleted")} (${counts.completed})` },
              { value: "abandoned", label: t("goals.filterAbandoned") },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={`rounded-full px-4 py-2 font-label-caps text-label-caps transition-colors ${
                  filter === option.value
                    ? "bg-primary text-on-primary"
                    : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {error && <ErrorBanner message={error} onRetry={fetchGoals} />}

          {loading ? (
            <LoadingRows rows={3} />
          ) : goals.length === 0 ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest">
              <EmptyState
                icon="flag"
                title={filter === "all" ? t("goals.emptyTitle") : t("goals.nothingHere")}
                description={t("goals.emptyBody")}
                action={<Button onClick={openCreate}>{t("goals.setFirst")}</Button>}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {goals.map((goal) => {
                const pct = Math.max(0, Math.min(100, goal.progress_percentage ?? 0));
                // The "from → to" readout is the core of the redesign: it shows
                // a journey, not a static ratio.
                const isWorkouts = goal.target_type === "workouts";
                const fromLabel = num(goal.starting_value);
                const currentLabel = num(goal.current_value);
                const targetLabel = num(goal.target_value);
                const repSuffix = goal.target_reps ? ` × ${goal.target_reps}` : "";

                return (
                  <article
                    key={goal.id}
                    className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
                  >
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-headline-lg-mobile text-headline-lg-mobile text-primary">
                          {goal.exercise?.name ?? t("goals.allWorkouts")}
                        </h2>
                        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                          {selectedTypeLabel(goal.target_type, t)}
                          {repSuffix}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => openEdit(goal)}
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                          aria-label={t("goals.editAria", { name: goal.exercise?.name ?? t("goals.allWorkouts") })}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(goal)}
                          className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                          aria-label={t("goals.deleteAria", { name: goal.exercise?.name ?? t("goals.allWorkouts") })}
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </header>

                    {/* Journey: baseline -> current -> target */}
                    <div className="mt-4 flex items-end justify-between gap-2">
                      <div>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">{t("goals.started")}</p>
                        <p className="font-metric-sm text-metric-sm text-on-surface">
                          {fromLabel} {isWorkouts ? "" : goal.unit}
                        </p>
                      </div>
                      <span
                        className="material-symbols-outlined text-[18px] text-on-surface-variant"
                        aria-hidden="true"
                      >
                        trending_flat
                      </span>
                      <div className="text-right">
                        <p className="font-label-caps text-label-caps text-on-surface-variant">{t("goals.target")}</p>
                        <p className="font-metric-sm text-metric-sm text-primary">
                          {targetLabel} {isWorkouts ? "" : goal.unit}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t("goals.progressAria", { name: goal.exercise?.name ?? t("goals.allWorkouts") })}
                      >
                        <div
                          className={`h-full rounded-full transition-all ${
                            goal.status === "completed" ? "bg-emerald-500" : "bg-primary"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-body-md text-body-md text-on-surface-variant">
                          {t("goals.nowLabel")} <strong className="text-on-surface">{currentLabel}</strong>
                          {!isWorkouts && ` ${goal.unit}`}
                        </span>
                        <span className="font-metric-sm text-metric-sm text-primary">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    </div>

                    <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
                      {goal.status === "completed" ? (
                        <Badge tone="success">{t("goals.statusCompleted")}</Badge>
                      ) : goal.status === "abandoned" ? (
                        <Badge tone="neutral">{t("goals.statusAbandoned")}</Badge>
                      ) : (
                        <Badge tone="primary">
                          {goal.remaining > 0
                            ? `${num(goal.remaining)}${isWorkouts ? "" : " " + goal.unit} ${t("goals.toGo")}`
                            : t("goals.almostThere")}
                        </Badge>
                      )}
                      {goal.deadline && (
                        <Badge tone="info">{t("goals.due", { date: formatDate(goal.deadline, locale) })}</Badge>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      {/* Create / edit */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-form-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-outline-variant bg-surface p-6"
          >
            <h2 id="goal-form-title" className="font-headline-lg text-headline-lg text-primary">
              {editingGoal ? t("goals.edit") : t("goals.new")}
            </h2>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {selectedType ? t(selectedType.hintKey) : ""}
            </p>

            <form onSubmit={submitGoal} className="mt-5 space-y-5">
              {/* Goal kind */}
              <fieldset>
                <legend className="font-label-caps text-label-caps text-on-surface-variant">
                  {t("goals.whatWorkingTowards")}
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {GOAL_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setTargetType(type.value)}
                      disabled={Boolean(editingGoal)}
                      aria-pressed={targetType === type.value}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                        targetType === type.value
                          ? "border-primary bg-surface-container-high"
                          : "border-outline-variant hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">
                        {type.icon}
                      </span>
                      <span className="font-body-md text-body-md text-on-surface">{t(type.labelKey)}</span>
                    </button>
                  ))}
                </div>
                {editingGoal && (
                  <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                    {t("goals.typeFixed")}
                  </p>
                )}
              </fieldset>

              {/* Exercise (not needed for workout-count goals) */}
              {targetType !== "workouts" && (
                <div>
                  <label
                    htmlFor="goal-exercise"
                    className="font-label-caps text-label-caps text-on-surface-variant"
                  >
                    {t("goals.exercise")}
                  </label>
                  <input
                    id="goal-exercise"
                    type="text"
                    value={exerciseSearch}
                    onChange={(event) => setExerciseSearch(event.target.value)}
                    disabled={Boolean(editingGoal)}
                    placeholder={t("goals.searchExercisesPlaceholder")}
                    autoComplete="off"
                    className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none disabled:opacity-60"
                  />
                  {exerciseResults.length > 0 && (
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-outline-variant bg-surface">
                      {exerciseResults.map((exercise) => (
                        <li key={exercise.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedExercise(exercise);
                              setExerciseSearch(exercise.name);
                              setExerciseResults([]);
                            }}
                            className="w-full px-4 py-2 text-left font-body-md text-body-md text-on-surface hover:bg-surface-container-low"
                          >
                            {exercise.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {editingGoal && (
                    <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                      {t("goals.exerciseFixed")}
                    </p>
                  )}
                </div>
              )}

              {/* Rep standard — only meaningful for weighted lifts */}
              {(targetType === "weight" || targetType === "one_rm") && (
                <div>
                  <label
                    htmlFor="goal-reps"
                    className="font-label-caps text-label-caps text-on-surface-variant"
                  >
                    {t("goals.repsOptional")}
                  </label>
                  <input
                    id="goal-reps"
                    type="number"
                    min={1}
                    max={500}
                    value={targetReps}
                    onChange={(event) => setTargetReps(event.target.value)}
                    placeholder={t("goals.targetPlaceholder")}
                    className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                    {t("goals.repsHint")}
                  </p>
                </div>
              )}

              {/* Target value, framed against the live baseline */}
              <div>
                <label
                  htmlFor="goal-target"
                  className="font-label-caps text-label-caps text-on-surface-variant"
                >
                  {t("goals.targetLabel", { unit: unitLabel })}
                </label>
                <input
                  id="goal-target"
                  type="number"
                  step={targetType === "reps" || targetType === "workouts" ? 1 : 0.5}
                  min={0}
                  value={targetValue}
                  onChange={(event) => setTargetValue(event.target.value)}
                  required
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />

                {targetType !== "workouts" && selectedExercise && (
                  <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                    {baselineLoading ? (
                      t("goals.checkingBest")
                    ) : baseline !== null ? (
                      <>
                        {t("goals.currentBestPrefix")}{" "}
                        <strong className="text-on-surface">
                          {num(baseline)} {unitLabel}
                        </strong>
                        {targetReps ? ` ${t("goals.currentBestAt", { reps: targetReps })}` : ""}.{" "}
                        {t("goals.currentBestSuffix")}
                      </>
                    ) : null}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="goal-deadline"
                  className="font-label-caps text-label-caps text-on-surface-variant"
                >
                  {t("goals.deadlineOptional")}
                </label>
                <input
                  id="goal-deadline"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                />
              </div>

              {editingGoal && (
                <div>
                  <label
                    htmlFor="goal-status"
                    className="font-label-caps text-label-caps text-on-surface-variant"
                  >
                    {t("goals.status")}
                  </label>
                  <select
                    id="goal-status"
                    value={statusValue}
                    onChange={(event) => setStatusValue(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="active">{t("goals.filterActive")}</option>
                    <option value="completed">{t("goals.filterCompleted")}</option>
                    <option value="abandoned">{t("goals.filterAbandoned")}</option>
                  </select>
                </div>
              )}

              {formError && (
                <p role="alert" className="rounded-lg bg-error-container p-3 font-body-md text-body-md text-on-error-container">
                  {formError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={closeModal} disabled={submitting}>
                  {t("action.cancel")}
                </Button>
                <Button type="submit" busy={submitting} disabled={submitting}>
                  {editingGoal ? t("goals.saveChanges") : t("goals.create")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("goals.deleteTitle")}
        description={t("goals.deleteBody", { name: deleteTarget?.exercise?.name ?? t("goals.thisGoal") })}
        confirmLabel={t("action.delete")}
        busy={submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppLayout>
  );
}

/**
 * Human label for a goal type, used on the cards.
 *
 * Takes `t` rather than calling the hook: this is a module-level helper, so
 * there is no hook context available here.
 */
function selectedTypeLabel(targetType: string, t: (key: string) => string): string {
  switch (targetType) {
    case "weight":
      return t("goals.kindWeight");
    case "one_rm":
      return t("goals.kindOneRm");
    case "reps":
      return t("goals.kindReps");
    case "workouts":
      return t("goals.kindWorkouts");
    default:
      return targetType;
  }
}

