"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import type { Paginated } from "@/types/exercise";
import type { Routine } from "@/types/routine";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";

type Exercise = { id: number; name: string; slug: string; category: string | null; equipment: string | null };

interface ExerciseDraft {
  exercise_id: number;
  name: string;
  target_sets: string;
  target_reps: string;
  target_weight_kg: string;
}

const emptyDraft = (): ExerciseDraft => ({
  exercise_id: 0,
  name: "",
  target_sets: "",
  target_reps: "",
  target_weight_kg: "",
});

export default function RoutinesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [estDuration, setEstDuration] = useState("");
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([]);

  // Exercise search (shared picker state, per-row selection index)
  const [searchFor, setSearchFor] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchRoutines = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Paginated<Routine>>("/routines");
      setRoutines(res.data ?? []);
      setError("");
    } catch (e: any) {
      if (e.status === 401) router.push("/login");
      setError(e.message || t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced exercise search
  useEffect(() => {
    if (searchFor === null) return;
    if (!searchInput.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiClient.get<Paginated<Exercise>>(
          `/exercises?search=${encodeURIComponent(searchInput)}`
        );
        setSearchResults(res.data ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchFor]);

  const openPicker = (rowIdx: number) => {
    setSearchFor(rowIdx);
    setSearchInput("");
    setSearchResults([]);
  };

  const pickExercise = (rowIdx: number, ex: Exercise) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === rowIdx ? { ...d, exercise_id: ex.id, name: ex.name } : d))
    );
    setSearchFor(null);
    setSearchInput("");
    setSearchResults([]);
  };

  const addDraft = () => setDrafts((prev) => [...prev, emptyDraft()]);

  const removeDraft = (idx: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== idx));

  const updateDraft = (idx: number, patch: Partial<ExerciseDraft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const moveDraft = (idx: number, dir: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const resetForm = () => {
    setName("");
    setNotes("");
    setEstDuration("");
    setDrafts([]);
    setSearchFor(null);
    setSearchInput("");
    setSearchResults([]);
    setFormError("");
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (r: Routine) => {
    resetForm();
    setEditing(r);
    setName(r.name);
    setNotes(r.notes ?? "");
    setEstDuration(r.est_duration_minutes != null ? String(r.est_duration_minutes) : "");
    setDrafts(
      (r.routine_exercises ?? []).map((re) => ({
        exercise_id: re.exercise?.id ?? 0,
        name: re.exercise?.name ?? "",
        target_sets: re.target_sets != null ? String(re.target_sets) : "",
        target_reps: re.target_reps != null ? String(re.target_reps) : "",
        target_weight_kg: re.target_weight_kg != null ? String(re.target_weight_kg) : "",
      }))
    );
  };

  const closeModals = () => {
    setShowCreate(false);
    setEditing(null);
    resetForm();
  };

  const buildPayload = () => ({
    name: name.trim(),
    notes: notes.trim() === "" ? null : notes.trim(),
    est_duration_minutes: estDuration === "" ? null : parseInt(estDuration, 10),
    exercises: drafts
      .filter((d) => d.exercise_id > 0)
      .map((d) => ({
        exercise_id: d.exercise_id,
        target_sets: d.target_sets === "" ? null : parseInt(d.target_sets, 10),
        target_reps: d.target_reps === "" ? null : parseInt(d.target_reps, 10),
        target_weight_kg: d.target_weight_kg === "" ? null : parseFloat(d.target_weight_kg),
      })),
  });

  const saveRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) { setFormError(t("routines.errName")); return; }
    if (estDuration !== "" && (isNaN(parseInt(estDuration, 10)) || parseInt(estDuration, 10) <= 0)) {
      setFormError(t("routines.errDuration"));
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.put(`/routines/${editing.id}`, buildPayload());
      } else {
        await apiClient.post("/routines", buildPayload());
      }
      closeModals();
      fetchRoutines();
    } catch (e: any) {
      setFormError(e.message || t("common.actionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRoutine = async (id: number) => {
    if (!confirm(t("routines.confirmDelete"))) return;
    try {
      await apiClient.delete(`/routines/${id}`);
      fetchRoutines();
    } catch (e: any) {
      alert(e.message || t("routines.errDelete"));
    }
  };

  const startRoutine = async (id: number) => {
    if (startingId != null) return;
    setStartingId(id);
    try {
      const session = await apiClient.post<{ id: number }>(`/routines/${id}/start`, {});
      if (session?.id) {
        try {
          sessionStorage.setItem("activeSessionId", String(session.id));
        } catch {
          // Private-mode storage can throw; the active page re-reads it from
          // the API when the id is absent.
        }
        window.location.href = "/workout/active";
      }
    } catch (e: any) {
      if (e.status === 401) router.push("/login");
      else alert(e.message || t("routines.errStart"));
      setStartingId(null);
    }
  };

  const modalOpen = showCreate || editing !== null;

  const renderModal = () => {
    if (!modalOpen) return null;
    const isEdit = editing !== null;
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeModals}>
        <div
          className="bg-surface rounded-xl border border-outline-variant p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="font-headline-lg text-headline-lg text-primary mb-4">
            {isEdit ? t("routines.edit") : t("routines.new")}
          </h2>
          <form onSubmit={saveRoutine} className="space-y-4">
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">{t("routines.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("routines.namePlaceholder")}
                className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">{t("routines.notesOptional")}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("routines.notesPlaceholder")}
                className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">
                {t("routines.durationLabel")}
              </label>
              <input
                type="number"
                value={estDuration}
                onChange={(e) => setEstDuration(e.target.value)}
                placeholder={t("routines.durationPlaceholder")}
                className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
              />
            </div>

            {/* Exercise list builder */}
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-2">
                {t("nav.exercises")}
              </label>
              {drafts.length === 0 && (
                <p className="font-body-md text-sm text-on-surface-variant mb-2">
                  {t("routines.noExercises")}
                </p>
              )}
              {drafts.map((d, idx) => (
                <div key={idx} className="border border-outline-variant rounded-lg p-3 mb-2 bg-surface">
                  {/* Exercise selector row */}
                  {d.exercise_id === 0 ? (
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={searchFor === idx ? searchInput : ""}
                        onChange={(e) => {
                          if (searchFor !== idx) openPicker(idx);
                          setSearchInput(e.target.value);
                        }}
                        onFocus={() => openPicker(idx)}
                        placeholder={t("exercises.searchPlaceholder")}
                        className="w-full border border-outline-variant rounded-lg px-4 py-2 bg-surface focus:border-primary focus:outline-none"
                      />
                      {searchFor === idx && searchResults.length > 0 && (
                        <ul className="mt-1 border border-outline-variant rounded-lg max-h-40 overflow-y-auto bg-surface z-10">
                          {searchResults.map((ex) => (
                            <li
                              key={ex.id}
                              className="px-4 py-2 hover:bg-surface-container-low cursor-pointer font-body-md text-sm"
                              onClick={() => pickExercise(idx, ex)}
                            >
                              {ex.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      {searchFor === idx && searchLoading && (
                        <p className="text-xs text-on-surface-variant mt-1">{t("routines.searching")}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-body-md text-sm text-on-surface truncate">
                        {d.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveDraft(idx, -1)}
                          disabled={idx === 0}
                          aria-label={t("routines.moveUpAria", { name: d.name })}
                          className="text-on-surface-variant hover:text-primary transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDraft(idx, 1)}
                          disabled={idx === drafts.length - 1}
                          aria-label={t("routines.moveDownAria", { name: d.name })}
                          className="text-on-surface-variant hover:text-primary transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDraft(idx)}
                          aria-label={t("routines.removeAria", { name: d.name })}
                          className="text-on-surface-variant hover:text-error transition-colors p-1"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Targets — visible once exercise selected */}
                  {d.exercise_id > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1 text-[10px]">{t("routines.setsLabel")}</label>
                        <input
                          type="number"
                          value={d.target_sets}
                          onChange={(e) => updateDraft(idx, { target_sets: e.target.value })}
                          placeholder="—"
                          className="w-full border border-outline-variant rounded-lg px-2 py-1.5 bg-surface focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1 text-[10px]">{t("routines.repsLabel")}</label>
                        <input
                          type="number"
                          value={d.target_reps}
                          onChange={(e) => updateDraft(idx, { target_reps: e.target.value })}
                          placeholder="—"
                          className="w-full border border-outline-variant rounded-lg px-2 py-1.5 bg-surface focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1 text-[10px]">{t("routines.kgLabel")}</label>
                        <input
                          type="number"
                          step={0.1}
                          value={d.target_weight_kg}
                          onChange={(e) => updateDraft(idx, { target_weight_kg: e.target.value })}
                          placeholder="—"
                          className="w-full border border-outline-variant rounded-lg px-2 py-1.5 bg-surface focus:border-primary focus:outline-none text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addDraft}
                className="w-full border-2 border-dashed border-outline-variant rounded-lg py-3 flex items-center justify-center gap-2 font-metric-sm text-metric-sm text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                {t("routines.addExercise")}
              </button>
            </div>

            {formError && <p className="text-error text-sm">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModals}
                className="px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors"
              >
                {t("action.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? t("action.saving") : isEdit ? t("goals.saveChanges") : t("routines.create")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-headline-lg font-headline-lg text-primary">{t("routines.title")}</h1>
          <button
            onClick={openCreate}
            className="bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm hover:bg-primary/90 transition-colors"
          >
            {t("routines.new")}
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 bg-error-container rounded-xl text-on-error-container text-center">
            <p>{error}</p>
            <button onClick={fetchRoutines} className="mt-2 text-primary font-semibold hover:underline">
              {t("action.retry")}
            </button>
          </div>
        ) : routines.length === 0 ? (
          <div className="border border-dashed border-outline-variant rounded-xl p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-outline block mb-4">list_alt</span>
            <p className="font-headline-lg-mobile text-primary">{t("routines.empty")}</p>
            <p className="font-body-md text-on-surface-variant mt-1">
              {t("routines.hint")}
            </p>
            <button
              onClick={openCreate}
              className="mt-6 bg-primary text-on-primary rounded-lg px-4 py-2 font-metric-sm hover:bg-primary/90 transition-colors"
            >
              {t("routines.new")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routines.map((r) => {
              const exNames = (r.routine_exercises ?? [])
                .map((re) => re.exercise?.name)
                .filter(Boolean) as string[];
              const count = r.routine_exercises_count ?? exNames.length;
              return (
                <div key={r.id} className="border border-outline-variant rounded-xl bg-surface-container-lowest p-5 flex flex-col">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-headline-lg-mobile text-primary">{r.name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        className="text-on-surface-variant hover:text-primary transition-colors p-1"
                        aria-label={t("routines.editAria", { name: r.name })}
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        onClick={() => deleteRoutine(r.id)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1"
                        aria-label={t("routines.deleteAria", { name: r.name })}
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                  <p className="font-body-md text-on-surface-variant mt-1 text-sm">
                    {count === 1
                      ? t("routines.exerciseCount", { count })
                      : t("routines.exerciseCountPlural", { count })}{" "}
                    · ~
                    {r.est_duration_minutes != null ? r.est_duration_minutes : "—"} min
                  </p>
                  <div className="mt-2 flex-1">
                    {exNames.slice(0, 3).map((n) => (
                      <p key={n} className="font-body-md text-sm text-on-surface truncate">
                        {n}
                      </p>
                    ))}
                    {exNames.length > 3 && (
                      <p className="font-body-md text-sm text-on-surface-variant">
                        {t("routines.more", { count: exNames.length - 3 })}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => startRoutine(r.id)}
                      disabled={startingId !== null}
                      className="bg-primary text-on-primary rounded-lg px-3 py-1 font-metric-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {startingId === r.id ? t("action.sending") : t("action.continue")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {renderModal()}
    </AppLayout>
  );
}
