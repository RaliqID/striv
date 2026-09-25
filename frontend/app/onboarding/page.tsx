"use client";

import { apiClient, ApiError } from "@/lib/api";
import { captureTokenFromUrl, readStoredUser } from "@/lib/auth";
import type { Exercise, Paginated } from "@/types/exercise";
import { useEffect, useState } from "react";

const TOTAL_STEPS = 6;

const GOALS = [
  { value: "muscle", label: "Build Muscle", desc: "Hypertrophy and volume focused" },
  { value: "strength", label: "Get Stronger", desc: "Maximal force production and CNS adaptation" },
  { value: "endurance", label: "Conditioning", desc: "Work capacity and metabolic conditioning" },
];

const EXPERIENCES = [
  { value: "beginner", label: "Beginner", desc: "0-1 years" },
  { value: "intermediate", label: "Intermediate", desc: "1-3 years" },
  { value: "advanced", label: "Advanced", desc: "3+ years" },
];

const FREQUENCIES = [
  { value: 2, label: "1-2", desc: "Days / Week" },
  { value: 4, label: "3-4", desc: "Days / Week" },
  { value: 6, label: "5+", desc: "Days / Week" },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);

  // Step 1: Personal info
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");

  // Step 2: Body metrics
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");

  // Step 3: Target weight
  const [targetWeight, setTargetWeight] = useState("");

  // Step 4: Primary goal
  const [goal, setGoal] = useState("");

  // Step 5: Experience + frequency
  const [experience, setExperience] = useState("");
  const [frequency, setFrequency] = useState<number | null>(null);

  // Step 6: Baseline goal (supports multiple exercises)
  const [movementSearch, setMovementSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  type BaselineEntry = { exercise: Exercise; targetLoad: string; targetReps: string };
  const [baselineEntries, setBaselineEntries] = useState<BaselineEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeTargetLoad, setActiveTargetLoad] = useState("");
  const [activeTargetReps, setActiveTargetReps] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user name from localStorage (and capture ?token= from Google redirect)
  useEffect(() => {
    (async () => {
      await captureTokenFromUrl();
      const user = readStoredUser();
      if (user?.name) setName(user.name);
    })();
  }, []);

  // Debounce exercise search 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(movementSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [movementSearch]);

  // Fetch exercises for search
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const params = new URLSearchParams();
    params.set("search", debouncedSearch);
    apiClient
      .get<Paginated<Exercise>>(`/exercises?${params.toString()}`)
      .then((response) => {
        if (cancelled) return;
        setSearchResults((response?.data ?? []).slice(0, 20));
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const nextStep = () => {
    setError(null);
    // Name is free text the member edits here, so it is validated before
    // advancing rather than failing later at save time.
    if (step === 1 && !name.trim()) {
      setError("Please enter a name so we know what to call you.");
      return;
    }
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  const startNewEntry = () => {
    const newIndex = baselineEntries.length;
    const next: BaselineEntry = { exercise: undefined as any, targetLoad: "", targetReps: "" };
    setBaselineEntries((prev) => [...prev, next]);
    setActiveIndex(newIndex);
    setMovementSearch("");
    setActiveTargetLoad("");
    setActiveTargetReps("");
    setSearchResults([]);
    setSearchFocused(false);
  };

  const removeEntry = (i: number) => {
    setBaselineEntries((prev) => prev.filter((_, idx) => idx !== i));
    if (activeIndex === i) {
      setActiveIndex(null);
      setMovementSearch("");
      setActiveTargetLoad("");
      setActiveTargetReps("");
      setSearchResults([]);
      setSearchFocused(false);
    } else if (activeIndex !== null && activeIndex > i) {
      setActiveIndex(activeIndex - 1);
    }
  };

  const selectExerciseForActive = (exercise: Exercise) => {
    setSearchResults([]);
    setMovementSearch(exercise.name);
    if (activeIndex !== null) {
      // Edit/append to the active draft in-place, preserving any load/reps already typed.
      setBaselineEntries((prev) => {
        const next = [...prev];
        const cur = next[activeIndex];
        next[activeIndex] = {
          exercise,
          targetLoad: cur?.targetLoad ?? activeTargetLoad,
          targetReps: cur?.targetReps ?? activeTargetReps,
        };
        return next;
      });
    } else {
      // No active draft: create a new entry and make it active so the form stays open.
      const newIndex = baselineEntries.length;
      setBaselineEntries((prev) => [
        ...prev,
        { exercise, targetLoad: activeTargetLoad, targetReps: activeTargetReps },
      ]);
      setActiveIndex(newIndex);
    }
  };

  const submitAll = async () => {
    if (submitting) return;
    setError(null);

    // Auto-commit active entry if valid
    let entries = baselineEntries;
    if (activeIndex !== null) {
      const trimmed = movementSearch.trim();
      const exercise = searchResults.find((e) => e.name === trimmed) || baselineEntries[activeIndex]?.exercise;
      if (exercise && trimmed) {
        const updated = [...baselineEntries];
        updated[activeIndex] = { exercise, targetLoad: activeTargetLoad, targetReps: activeTargetReps };
        entries = updated;
      }
    }

    const valid = entries.filter((e) => e && e.exercise);
    if (valid.length === 0) {
      setError("Add at least one baseline goal.");
      return;
    }

    // Each baseline entry needs a target the member is actually working towards.
    // The server refuses a target that is not above the current baseline, so
    // catch it here where the message can point at the offending row.
    const incomplete = valid.find((e) => !e.targetLoad || Number(e.targetLoad) <= 0);
    if (incomplete) {
      setError(`Enter a target weight for ${incomplete.exercise.name}.`);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.put("/profile", {
        name: name.trim(),
        age: age ? Number(age) : null,
        location: location.trim() || null,
        weight_kg: weight ? Number(weight) : null,
        height_cm: height ? Number(height) : null,
        target_weight_kg: targetWeight ? Number(targetWeight) : null,
        experience_level: experience || null,
        primary_goal: goal || null,
        training_frequency: frequency,
        complete_onboarding: true,
      });

      // Create the baseline goals. A goal whose target is already met is
      // refused by the API, so failures are collected and reported together
      // rather than silently dropping goals the member thought they had set.
      const failedGoals: string[] = [];
      for (const entry of valid) {
        try {
          await apiClient.post("/goals", {
            exercise_id: entry.exercise.id,
            target_type: "weight",
            target_value: entry.targetLoad ? Number(entry.targetLoad) : null,
            target_reps: entry.targetReps ? Number(entry.targetReps) : null,
            deadline: null,
          });
        } catch (goalError) {
          const label = entry.exercise?.name ?? "goal";
          failedGoals.push(
            goalError instanceof ApiError ? `${label}: ${goalError.message}` : label
          );
        }
      }

      if (failedGoals.length > 0) {
        setError(
          `Profile saved, but these goals need a new target: ${failedGoals.join("; ")}`
        );
        setSubmitting(false);
        return;
      }

      // Refresh localStorage with the new profile so dashboard guard sees
      // onboarding_completed_at, otherwise dashboard loops back here.
      try {
        const me = await apiClient.get<any>("/auth/user");
        if (me) localStorage.setItem("user", JSON.stringify(me));
      } catch {
        // Profile save already succeeded; a stale cache only affects the next
        // page read and is refreshed on the following load.
      }

      // Hard navigation so the dashboard mounts with a fresh store and token.
      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't complete setup.");
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full bg-transparent border-b-2 border-outline-variant focus:border-primary pb-2 font-metric-display text-headline-lg text-on-surface transition-colors outline-none";

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center relative overflow-x-hidden font-body-md">
      <div
        className={`fixed top-0 left-0 w-full px-margin-mobile md:px-margin-desktop py-8 flex items-center justify-between z-10 transition-opacity duration-300 ${
          step > 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="font-headline-lg text-headline-lg font-black text-primary tracking-tighter">Striv</div>
        <div className="flex gap-2 items-center">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-1 rounded-full transition-colors ${
                i < step ? "bg-primary" : "bg-outline-variant"
              }`}
            ></div>
          ))}
        </div>
        <button
          type="button"
          className="font-metric-sm text-metric-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
          onClick={prevStep}
          disabled={step === 1}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back
        </button>
      </div>

      <main className="w-full max-w-2xl px-margin-mobile md:px-margin-desktop relative">
        {error && (
          <div className="mb-6 rounded-md bg-error-container p-3 text-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Personal Info</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Let&apos;s calibrate your intelligence engine.
            </p>
            <div className="grid gap-8">
              <div>
                <label htmlFor="ob-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Name</label>
                <input
                  id="ob-name"
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  maxLength={255}
                  placeholder="What should we call you?"
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="ob-age" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Age</label>
                <input
                  id="ob-age"
                  className={inputClass}
                  type="number"
                  min={13}
                  max={100}
                  placeholder="e.g. 27"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ob-location" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Location</label>
                <input
                  id="ob-location"
                  className={inputClass}
                  type="text"
                  maxLength={255}
                  placeholder="e.g. Jakarta"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Body Metrics</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Used to compute volume relative loads and progressions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label htmlFor="ob-weight" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Weight (kg)</label>
                <input
                  id="ob-weight"
                  className={inputClass}
                  type="number"
                  step={0.1}
                  min={20}
                  max={400}
                  placeholder="e.g. 78.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ob-height" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Height (cm)</label>
                <input
                  id="ob-height"
                  className={inputClass}
                  type="number"
                  step={0.1}
                  min={100}
                  max={250}
                  placeholder="e.g. 176"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Target Weight</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Where do you want your bodyweight to trend?
            </p>
            <div>
              <label htmlFor="ob-target-weight" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">Target Weight (kg)</label>
              <input
                id="ob-target-weight"
                className={inputClass}
                type="number"
                step={0.1}
                min={20}
                max={400}
                placeholder="e.g. 80"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
              />
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">What is your primary training goal?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">This optimizes your progression algorithms.</p>
            <div className="grid gap-4">
              {GOALS.map((opt) => (
                <label key={opt.value} className="group relative cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="goal"
                    value={opt.value}
                    checked={goal === opt.value}
                    onChange={(e) => setGoal(e.target.value)}
                  />
                  <div className="p-6 border border-outline-variant rounded-xl peer-checked:border-primary peer-checked:bg-surface-container-low hover:bg-surface-container-lowest transition-all flex items-center justify-between">
                    <div>
                      <div className="font-metric-sm text-metric-sm text-on-surface mb-1">{opt.label}</div>
                      <div className="font-body-md text-body-md text-on-surface-variant text-sm">{opt.desc}</div>
                    </div>
                    <span className="material-symbols-outlined text-outline-variant peer-checked:text-primary transition-colors">
                      check_circle
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Experience & Frequency</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Dictates baseline volume and fatigue management.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {EXPERIENCES.map((opt) => (
                <label key={opt.value} className="group relative cursor-pointer h-full">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="experience"
                    value={opt.value}
                    checked={experience === opt.value}
                    onChange={(e) => setExperience(e.target.value)}
                  />
                  <div className="h-full p-6 border border-outline-variant rounded-xl peer-checked:border-primary peer-checked:bg-surface-container-low hover:bg-surface-container-lowest transition-all flex flex-col justify-between">
                    <span className="material-symbols-outlined text-outline-variant mb-4">
                      signal_cellular_{opt.value === "beginner" ? "1" : opt.value === "intermediate" ? "3" : "4"}_bar
                    </span>
                    <div>
                      <div className="font-metric-sm text-metric-sm text-on-surface mb-1">{opt.label}</div>
                      <div className="font-body-md text-body-md text-on-surface-variant text-sm">{opt.desc}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {FREQUENCIES.map((opt) => (
                <label key={opt.value} className="group relative cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="frequency"
                    value={opt.value}
                    checked={frequency === opt.value}
                    onChange={() => setFrequency(opt.value)}
                  />
                  <div className="p-6 border border-outline-variant rounded-xl peer-checked:border-primary peer-checked:bg-surface-container-low hover:bg-surface-container-lowest transition-all text-center">
                    <div className="font-metric-display text-metric-display text-on-surface mb-1">{opt.label}</div>
                    <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Establish Baseline Goals</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-12">
              Set measurable targets to track towards. You can add as many as you want.
            </p>

            {/* Saved entry cards. The active draft without an exercise is hidden
                because the form below already represents it. */}
            {baselineEntries.map((entry, i) => {
              if (i === activeIndex && !entry.exercise) return null;
              const isActive = activeIndex === i;
              return (
                <div
                  key={i}
                  className={`bg-surface-container-lowest border p-6 rounded-xl shadow-sm mb-4 flex items-center justify-between gap-4 transition-colors ${
                    isActive ? "border-primary" : "border-outline-variant"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-metric-sm text-metric-sm text-primary truncate">
                      {entry.exercise?.name ?? "Unselected"}
                    </p>
                    <p className="font-body-md text-sm text-on-surface-variant">
                      {entry.targetLoad ? `${entry.targetLoad} kg` : "—"} ×{" "}
                      {entry.targetReps ? `${entry.targetReps} reps` : "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveIndex(i);
                        setMovementSearch(entry.exercise?.name ?? "");
                        setActiveTargetLoad(entry.targetLoad);
                        setActiveTargetReps(entry.targetReps);
                        setSearchResults([]);
                        setSearchFocused(false);
                        setError(null);
                      }}
                      className="text-on-surface-variant hover:text-primary p-1 rounded transition-colors"
                      title="Edit"
                      aria-label="Edit goal"
                    >
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      className="text-on-surface-variant hover:text-error p-1 rounded transition-colors"
                      title="Delete"
                      aria-label="Delete goal"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Active draft form. Shown only when a draft is open. */}
            {activeIndex !== null && (
              <div className="bg-surface-container-lowest border border-primary p-8 rounded-xl shadow-sm mb-6">
                <div className="mb-8 relative">
                  <label
                    htmlFor="ob-movement"
                    className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
                  >
                    Movement
                  </label>
                  <input
                    id="ob-movement"
                    className={inputClass}
                    placeholder="Search exercises... e.g. Bench Press"
                    value={movementSearch}
                    autoComplete="off"
                    onChange={(e) => {
                      const v = e.target.value;
                      setMovementSearch(v);
                      if (v.trim().length === 0) {
                        // Hide dropdown immediately when input is cleared
                        setSearchResults([]);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchResults[0]) {
                        e.preventDefault();
                        selectExerciseForActive(searchResults[0]);
                      } else if (e.key === "Escape") {
                        setSearchResults([]);
                      }
                    }}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => {
                      setSearchFocused(false);
                      // 150ms delay so a click on a result can register first
                      setTimeout(() => setSearchResults([]), 150);
                    }}
                  />
                  {(() => {
                    const boundExercise =
                      activeIndex !== null ? baselineEntries[activeIndex]?.exercise : null;
                    const open =
                      searchFocused &&
                      movementSearch.trim().length > 0 &&
                      searchResults.length > 0 &&
                      (!boundExercise || movementSearch.trim() !== boundExercise.name);
                    if (!open) return null;
                    return (
                      <div
                        className="absolute left-0 right-0 top-full mt-2 bg-surface border border-outline-variant rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {searchLoading ? (
                          <p className="px-4 py-3 font-body-md text-sm text-on-surface-variant">
                            Searching...
                          </p>
                        ) : (
                          searchResults.map((exercise) => (
                            <button
                              key={exercise.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors font-body-md text-sm text-on-surface"
                              onClick={() => {
                                selectExerciseForActive(exercise);
                                setSearchResults([]);
                                setSearchFocused(false);
                              }}
                            >
                              {exercise.name}
                              {exercise.equipment && (
                                <span className="text-on-surface-variant">
                                  {" "}
                                  • {exercise.equipment}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <label
                      htmlFor="ob-load"
                      className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
                    >
                      Target Weight (kg)
                    </label>
                    <input
                      id="ob-load"
                      className={inputClass}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      placeholder="e.g. 80"
                      value={activeTargetLoad}
                      onChange={(e) => {
                        const v = e.target.value;
                        setActiveTargetLoad(v);
                        // Real-time save: reflect into the entry immediately
                        if (activeIndex !== null) {
                          const idx = activeIndex;
                          setBaselineEntries((prev) => {
                            const next = [...prev];
                            const cur = next[idx];
                            if (cur) next[idx] = { ...cur, targetLoad: v };
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ob-reps"
                      className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block"
                    >
                      For how many reps
                    </label>
                    <input
                      id="ob-reps"
                      className={inputClass}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={500}
                      placeholder="e.g. 5"
                      value={activeTargetReps}
                      onChange={(e) => {
                        const v = e.target.value;
                        setActiveTargetReps(v);
                        if (activeIndex !== null) {
                          const idx = activeIndex;
                          setBaselineEntries((prev) => {
                            const next = [...prev];
                            const cur = next[idx];
                            if (cur) next[idx] = { ...cur, targetReps: v };
                            return next;
                          });
                        }
                      }}
                    />
                  </div>
                </div>
                {/* Explain what the pair means, since the rep count is the part
                    that makes the target a real standard rather than a number. */}
                <p className="mt-3 font-body-md text-body-md text-on-surface-variant">
                  For example: <strong className="text-on-surface">80 kg for 5 reps</strong> means
                  performing 5 reps at 80 kg. Only sets with at least 5 reps will count towards it.
                </p>
                <div className="mt-6 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeIndex === null) return;
                      const idx = activeIndex;
                      // If the draft has no exercise, discard it entirely.
                      if (!baselineEntries[idx]?.exercise) {
                        setBaselineEntries((prev) =>
                          prev.filter((_, j) => j !== idx),
                        );
                      }
                      setActiveIndex(null);
                      setMovementSearch("");
                      setActiveTargetLoad("");
                      setActiveTargetReps("");
                      setSearchResults([]);
                      setSearchFocused(false);
                      setError(null);
                    }}
                    className="text-on-surface-variant hover:text-on-surface font-metric-sm text-metric-sm px-3 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      activeIndex === null || !baselineEntries[activeIndex]?.exercise
                    }
                    onClick={() => {
                      // Data is already live-saved; this just collapses the form.
                      setActiveIndex(null);
                      setMovementSearch("");
                      setActiveTargetLoad("");
                      setActiveTargetReps("");
                      setSearchResults([]);
                      setSearchFocused(false);
                      setError(null);
                    }}
                    className="border border-primary text-primary font-metric-sm text-metric-sm px-4 py-2 rounded-lg hover:bg-primary-container hover:text-on-primary transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">check</span>{" "}
                    Save Goal
                  </button>
                </div>
              </div>
            )}

            {/* Add entry button (hidden while a draft is open) */}
            {activeIndex === null &&
              (baselineEntries.length === 0 ? (
                <button
                  type="button"
                  onClick={startNewEntry}
                  className="bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95 mb-8 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">add</span> Add Exercise
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startNewEntry}
                  className="border border-dashed border-outline-variant text-on-surface-variant font-metric-sm text-metric-sm px-6 py-4 rounded-xl hover:border-primary hover:text-primary transition-colors mb-8 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">add</span> Add Another Exercise
                </button>
              ))}

            {/* Submit section */}
            {(() => {
              const hasValidEntry =
                baselineEntries.some((e) => e && e.exercise) ||
                (activeIndex !== null && !!baselineEntries[activeIndex]?.exercise);
              return (
                <>
                  {!hasValidEntry && (
                    <div
                      className="mb-4 flex items-center justify-between gap-3 bg-error-container text-on-error-container rounded-lg px-4 py-3"
                      role="alert"
                    >
                      <span className="font-body-md text-sm">
                        Add at least one baseline goal to continue.
                      </span>
                      {activeIndex === null && (
                        <button
                          type="button"
                          onClick={startNewEntry}
                          className="font-metric-sm text-metric-sm underline underline-offset-2 hover:opacity-80 shrink-0"
                        >
                          Add one
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={submitAll}
                      disabled={submitting || !hasValidEntry}
                    >
                      {submitting ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[18px]">
                            sync
                          </span>{" "}
                          Processing...
                        </>
                      ) : (
                        <>
                          Build My Striv
                          <span className="material-symbols-outlined text-[18px]">bolt</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
