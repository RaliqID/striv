"use client";

import { apiClient, ApiError } from "@/lib/api";
import { captureTokenFromUrl, readStoredUser } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";

const TOTAL_STEPS = 5;

// Option lists carry translation keys, resolved at render time so a language
// switch updates the labels without rebuilding the arrays.
const GOALS = [
  { value: "muscle", labelKey: "onboarding.goalMuscle", descKey: "onboarding.goalMuscleDesc" },
  { value: "strength", labelKey: "onboarding.goalStrength", descKey: "onboarding.goalStrengthDesc" },
  { value: "endurance", labelKey: "onboarding.goalEndurance", descKey: "onboarding.goalEnduranceDesc" },
];

const EXPERIENCES = [
  { value: "beginner", labelKey: "onboarding.expBeginner", descKey: "onboarding.expBeginnerDesc" },
  { value: "intermediate", labelKey: "onboarding.expIntermediate", descKey: "onboarding.expIntermediateDesc" },
  { value: "advanced", labelKey: "onboarding.expAdvanced", descKey: "onboarding.expAdvancedDesc" },
];

const FREQUENCIES = [
  { value: 2, label: "1-2" },
  { value: 4, label: "3-4" },
  { value: 6, label: "5+" },
];

export default function OnboardingPage() {
  const { t } = useTranslation();
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

  const nextStep = () => {
    setError(null);
    // Name is free text the member edits here, so it is validated before
    // advancing rather than failing later at save time.
    if (step === 1 && !name.trim()) {
      setError(t("onboarding.needName"));
      return;
    }
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };


  const submitAll = async () => {
    if (submitting) return;
    setError(null);

    // The primary goal decides which trainer specialisation the matcher
    // prefers, so it is required rather than optional: sending null would drop
    // the member into pure workload ordering and ignore their intent.
    if (!goal) {
      setError(t("onboarding.needGoal"));
      return;
    }

    setSubmitting(true);
    try {
      /*
       * Saving the profile with complete_onboarding is what triggers automatic
       * matching server-side: the request already exists from signup, and this
       * is the call that supplies the goal it was waiting for. No baseline
       * goals are created here — the trainer authors the programme, which is
       * the whole point of being matched with one.
       */
      await apiClient.put("/profile", {
        name: name.trim(),
        age: age ? Number(age) : null,
        location: location.trim() || null,
        weight_kg: weight ? Number(weight) : null,
        height_cm: height ? Number(height) : null,
        target_weight_kg: targetWeight ? Number(targetWeight) : null,
        experience_level: experience || null,
        primary_goal: goal,
        training_frequency: frequency,
        complete_onboarding: true,
      });

      // Refresh the cached user so the dashboard guard sees
      // onboarding_completed_at; otherwise it loops back to this page.
      try {
        const me = await apiClient.get<any>("/auth/user");
        if (me) localStorage.setItem("user", JSON.stringify(me));
      } catch {
        // Profile save already succeeded; a stale cache is refreshed on the
        // next page load.
      }

      // Straight to the matching screen, which shows the assignment as soon as
      // it lands rather than making the member hunt for it on the dashboard.
      window.location.href = "/matching";
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("live.onboardingFailed"));
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
          <span className="material-symbols-outlined text-[18px]">arrow_back</span> {t("onboarding.back")}
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
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t("onboarding.personalInfo")}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              {t("onboarding.calibrate")}
            </p>
            <div className="grid gap-8">
              <div>
                <label htmlFor="ob-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.name")}</label>
                <input
                  id="ob-name"
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  maxLength={255}
                  placeholder={t("onboarding.namePlaceholder")}
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="ob-age" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.age")}</label>
                <input
                  id="ob-age"
                  className={inputClass}
                  type="number"
                  min={13}
                  max={100}
                  placeholder={t("onboarding.agePlaceholder")}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ob-location" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.location")}</label>
                <input
                  id="ob-location"
                  className={inputClass}
                  type="text"
                  maxLength={255}
                  placeholder={t("onboarding.locationPlaceholder")}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                {t("action.continue")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t("onboarding.bodyMetrics")}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              {t("onboarding.bodyMetricsHint")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label htmlFor="ob-weight" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.weight")}</label>
                <input
                  id="ob-weight"
                  className={inputClass}
                  type="number"
                  step={0.1}
                  min={20}
                  max={400}
                  placeholder={t("onboarding.weightPlaceholder")}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ob-height" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.height")}</label>
                <input
                  id="ob-height"
                  className={inputClass}
                  type="number"
                  step={0.1}
                  min={100}
                  max={250}
                  placeholder={t("onboarding.heightPlaceholder")}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                {t("action.continue")}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t("onboarding.targetWeight")}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              {t("onboarding.targetWeightHint")}
            </p>
            <div>
              <label htmlFor="ob-target-weight" className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-2 block">{t("onboarding.targetWeightLabel")}</label>
              <input
                id="ob-target-weight"
                className={inputClass}
                type="number"
                step={0.1}
                min={20}
                max={400}
                placeholder={t("onboarding.targetWeightPlaceholder")}
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
              />
            </div>
            <div className="mt-12 flex justify-end">
              <button type="button" className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95" onClick={nextStep}>
                {t("action.continue")}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t("onboarding.primaryGoal")}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">{t("onboarding.primaryGoalHelper")}</p>
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
                      <div className="font-metric-sm text-metric-sm text-on-surface mb-1">{t(opt.labelKey)}</div>
                      <div className="font-body-md text-body-md text-on-surface-variant text-sm">{t(opt.descKey)}</div>
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
                {t("action.continue")}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t("onboarding.experienceFrequency")}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              {t("onboarding.experienceHint")}
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
                      <div className="font-metric-sm text-metric-sm text-on-surface mb-1">{t(opt.labelKey)}</div>
                      <div className="font-body-md text-body-md text-on-surface-variant text-sm">{t(opt.descKey)}</div>
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
                    <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">{t("onboarding.daysPerWeek")}</div>
                  </div>
                </label>
              ))}
            </div>

            {/*
              Final step hands off to matching rather than asking the member to
              invent kg/reps targets. A beginner cannot know which movements or
              loads move them toward their goal — that is the trainer's job, and
              asking for numbers here is exactly the unprofessional experience
              this flow now avoids.
            */}
            <div className="mt-8 rounded-xl border border-outline-variant bg-surface-container-low p-6">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[24px] text-primary shrink-0">
                  support_agent
                </span>
                <div>
                  <h3 className="font-metric-sm text-metric-sm text-on-surface mb-1">
                    {t("onboarding.matchTitle")}
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {t("onboarding.matchBody")}
                    {goal && (
                      <span className="mt-2 block font-label-caps text-label-caps text-primary">
                        {t(GOALS.find((g) => g.value === goal)?.labelKey ?? "")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                className="bg-primary text-on-primary font-metric-sm text-metric-sm px-8 py-4 rounded-xl hover:bg-primary-container transition-all active:scale-95 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={submitAll}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                    Setting up…
                  </>
                ) : (
                  <>
                    {t("onboarding.findTrainer")}
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
