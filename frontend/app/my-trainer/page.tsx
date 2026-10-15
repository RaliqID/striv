"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient, ApiError } from "@/lib/api";
import type { MemberOverview, ScheduleSlot } from "@/lib/training";
import { DAY_NAMES } from "@/lib/training";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnit } from "@/lib/use-unit";
import { useCallback, useEffect, useState } from "react";

/**
 * Backend `specialization` is a raw enum (`muscle` | `strength` | `endurance`).
 * Map it to a dictionary key so the pill reads naturally in either locale
 * rather than leaking the raw value (e.g. "strength") on screen.
 */
const SPECIALISATION_KEYS: Record<string, string> = {
  muscle: "settings.specMuscle",
  strength: "settings.specStrength",
  endurance: "settings.specEndurance",
};

/**
 * The member's view of their coaching relationship.
 *
 * Renders one of four states, chosen from the backend's `state` field rather
 * than derived here — the server already decides what "waiting" means, and
 * re-deriving it client-side is how the two drift apart.
 */
export default function MyTrainerPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<MemberOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Propose-slot form state.
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeDay, setProposeDay] = useState(1);
  const [proposeFocus, setProposeFocus] = useState("");

  // Rating state.
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingOpen, setRatingOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<MemberOverview>("/my-trainer");
      setOverview(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
    /*
     * `t` is a dependency because the catch above uses it for the fallback
     * message. It is a useCallback keyed on locale, so it is stable until the
     * language changes — at which point this callback is rebuilt and a later
     * failure reports in the new language rather than the original one.
     */
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<{ message?: string } | void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (res && "message" in res && res.message) setNotice(res.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const respondToSlot = (slot: ScheduleSlot, response: "accepted" | "declined") =>
    act(`slot-${slot.id}`, async () => {
      const res = await apiClient.post<{ overview: MemberOverview }>(
        `/my-trainer/schedule/${slot.id}/respond`,
        { response }
      );
      setOverview(res.overview);
      return { message: response === "accepted" ? t("trainer.slotConfirmed") : t("trainer.slotDeclined") };
    });

  const proposeSlot = () =>
    act("propose", async () => {
      await apiClient.post("/my-trainer/schedule", {
        day_of_week: proposeDay,
        focus: proposeFocus.trim() || null,
      });
      setProposeOpen(false);
      setProposeFocus("");
      return { message: t("trainer.slotProposedMsg") };
    });

  const release = () =>
    act("release", async () => {
      const res = await apiClient.post<{ message: string; rematched: boolean }>(
        "/my-trainer/release",
        {}
      );
      return { message: res.message };
    });

  const submitRating = () =>
    act("rate", async () => {
      if (ratingValue < 1) throw new Error(t("trainer.chooseRating"));
      await apiClient.post("/my-trainer/rate", {
        rating: ratingValue,
        message: ratingComment.trim() || null,
      });
      setRatingOpen(false);
      setRatingValue(0);
      setRatingComment("");
      return { message: t("trainer.ratingThanks") };
    });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
            progress_activity
          </span>
        </div>
      </AppLayout>
    );
  }

  const state = overview?.state ?? "unmatched";

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-container-max min-w-0 space-y-6">
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant">{t("trainer.coaching")}</p>
          <h1 className="mt-1 font-headline-lg text-headline-lg text-primary">{t("trainer.pageTitle")}</h1>
        </div>

        {error && (
          <div className="rounded-lg bg-error-container p-4 text-sm text-on-error-container" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg bg-secondary-container p-4 text-sm text-on-secondary-container" role="status">
            {notice}
          </div>
        )}

        {/* States where there is no active trainer yet. */}
        {state === "unmatched" && <UnmatchedCard onRetry={() => act("request", async () => {
          const res = await apiClient.post<{ overview: MemberOverview; message: string }>("/my-trainer/request", {});
          setOverview(res.overview);
          return { message: res.message };
        })} busy={busy === "request"} />}

        {/* Trainer is assigned. Everything below is the live relationship. */}
        {overview?.trainer && (
          <>
            <TrainerCard
              trainer={overview.trainer}
              assignment={overview.assignment}
              onRate={() => setRatingOpen(true)}
            />

            <ScheduleSection
              slots={overview.schedule}
              confirmed={overview.assignment?.confirmed ?? false}
              busy={busy}
              onRespond={respondToSlot}
              proposeOpen={proposeOpen}
              setProposeOpen={setProposeOpen}
              proposeDay={proposeDay}
              setProposeDay={setProposeDay}
              proposeFocus={proposeFocus}
              setProposeFocus={setProposeFocus}
              onPropose={proposeSlot}
            />

            <ProgramSection programs={overview.program} />

            <FeedbackSection feedback={overview.feedback} onReload={load} />

            {/* Exit valve, deliberately low-key: available but not inviting. */}
            <div className="border-t border-outline-variant pt-6">
              <details className="group">
                <summary className="cursor-pointer font-metric-sm text-metric-sm text-on-surface-variant hover:text-on-surface list-none flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] group-open:rotate-90 transition-transform">
                    chevron_right
                  </span>
                  {t("trainer.changeTrainer")}
                </summary>
                <div className="mt-3 rounded-lg border border-outline-variant p-4">
                  <p className="font-body-md text-sm text-on-surface-variant mb-3">
                    {t("trainer.releaseBody1")}
                    {t("trainer.releaseBody2")}
                  </p>
                  <button
                    type="button"
                    onClick={release}
                    disabled={busy === "release"}
                    className="border border-error text-error font-metric-sm text-metric-sm px-4 py-2 rounded-lg hover:bg-error/5 transition-colors disabled:opacity-50"
                  >
                    {busy === "release" ? t("trainer.releasing") : t("trainer.releaseAction")}
                  </button>
                </div>
              </details>
            </div>
          </>
        )}

        {ratingOpen && (
          <RatingDialog
            value={ratingValue}
            setValue={setRatingValue}
            comment={ratingComment}
            setComment={setRatingComment}
            onCancel={() => setRatingOpen(false)}
            onSubmit={submitRating}
            busy={busy === "rate"}
          />
        )}
      </div>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */

function UnmatchedCard({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-8 text-center">
      <span className="material-symbols-outlined text-[40px] text-on-surface-variant">person_search</span>
      <h2 className="mt-3 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
        {t("trainer.noTrainerTitle")}
      </h2>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
        {t("trainer.noTrainerBody")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="mt-6 bg-primary text-on-primary font-metric-sm text-metric-sm px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {busy ? t("action.checking") : t("trainer.checkForTrainer")}
      </button>
    </div>
  );
}

function TrainerCard({
  trainer,
  assignment,
  onRate,
}: {
  trainer: NonNullable<MemberOverview["trainer"]>;
  assignment: MemberOverview["assignment"];
  onRate: () => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 font-headline-lg-mobile text-headline-lg-mobile text-primary">
          {trainer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
              {trainer.name}
            </h2>
            {trainer.rating !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-2 py-0.5 font-label-caps text-label-caps text-on-secondary-container">
                <span className="material-symbols-outlined text-[14px]">star</span>
                {trainer.rating.toFixed(1)}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-outline-variant px-2 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
              {trainer.specialization
                ? t(SPECIALISATION_KEYS[trainer.specialization] ?? "trainer.generalSpecialisation")
                : t("trainer.generalSpecialisation")}
            </span>
          </div>
          {trainer.bio && (
            <p className="mt-3 font-body-md text-body-md text-on-surface-variant">{trainer.bio}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 font-label-caps text-label-caps text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${assignment?.confirmed ? "bg-primary" : "bg-outline"}`}
              />
              {assignment?.confirmed ? t("trainer.scheduleConfirmed") : t("trainer.awaitingSchedule")}
            </span>
            {assignment?.started_at && (
              <span>{t("trainer.since")} {new Date(assignment.started_at).toLocaleDateString(locale)}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRate}
          className="shrink-0 border border-outline-variant text-on-surface font-metric-sm text-metric-sm px-3 py-2 rounded-lg hover:bg-surface-container-lowest transition-colors"
        >
          {t("trainer.rateCoaching")}
        </button>
      </div>
    </div>
  );
}

function ScheduleSection({
  slots,
  confirmed,
  busy,
  onRespond,
  proposeOpen,
  setProposeOpen,
  proposeDay,
  setProposeDay,
  proposeFocus,
  setProposeFocus,
  onPropose,
}: {
  slots: ScheduleSlot[];
  confirmed: boolean;
  busy: string | null;
  onRespond: (slot: ScheduleSlot, response: "accepted" | "declined") => void;
  proposeOpen: boolean;
  setProposeOpen: (v: boolean) => void;
  proposeDay: number;
  setProposeDay: (v: number) => void;
  proposeFocus: string;
  setProposeFocus: (v: string) => void;
  onPropose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-metric-sm text-metric-sm text-on-surface">{t("trainer.weeklySchedule")}</h2>
        <button
          type="button"
          onClick={() => setProposeOpen(!proposeOpen)}
          className="text-primary font-metric-sm text-metric-sm hover:underline"
        >
          {proposeOpen ? t("action.cancel") : t("trainer.proposeSlot")}
        </button>
      </div>

      {slots.length === 0 && !proposeOpen && (
        <p className="font-body-md text-sm text-on-surface-variant">
          {confirmed
            ? t("trainer.noSchedule")
            : t("trainer.trainerWillSend")}
        </p>
      )}

      {slots.length > 0 && (
        <ul className="space-y-2">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-metric-sm text-metric-sm text-on-surface">
                    {t(`day.${slot.day_of_week}`) === `day.${slot.day_of_week}` ? slot.day_name : t(`day.${slot.day_of_week}`)}
                  </span>
                  {/*
                    No time is shown. The weekly schedule says WHICH day trains
                    which focus; pinning a clock time here implied a fixed
                    appointment the member had to hit, which the system does not
                    actually enforce. The focus label is the useful part.
                  */}
                  {slot.awaiting_member && (
                    <span className="rounded-full bg-tertiary-container px-2 py-0.5 font-label-caps text-label-caps text-on-tertiary-container">
                      {t("trainer.needsReply")}
                    </span>
                  )}
                </div>
                {slot.focus && (
                  <p className="mt-1 font-body-md text-sm text-on-surface-variant">{slot.focus}</p>
                )}
              </div>

              {slot.awaiting_member ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRespond(slot, "accepted")}
                    disabled={busy === `slot-${slot.id}`}
                    className="bg-primary text-on-primary font-metric-sm text-metric-sm px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {t("action.accept")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespond(slot, "declined")}
                    disabled={busy === `slot-${slot.id}`}
                    className="border border-outline-variant font-metric-sm text-metric-sm px-3 py-1.5 rounded-lg hover:bg-surface-container-low transition-colors disabled:opacity-50"
                  >
                    {t("action.decline")}
                  </button>
                </div>
              ) : (
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  {slot.confirmed_at
                    ? t("trainer.confirmed")
                    : slot.proposed_by === "member"
                      ? t("trainer.proposedByYou")
                      : t("trainer.proposed")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {proposeOpen && (
        <div className="mt-4 rounded-lg border border-primary bg-surface-container-lowest p-4 space-y-3">
          {/*
            No time field: the schedule answers "which day for which focus",
            not "what o'clock". A member trains when they get there, and asking
            for a slot made the plan look like a fixed appointment.
          */}
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1 block">
              {t("trainer.day")}
            </span>
            <select
              value={proposeDay}
              onChange={(e) => setProposeDay(Number(e.target.value))}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
            >
              {Object.entries(DAY_NAMES).map(([num]) => (
                <option key={num} value={num}>
                  {t(`day.${num}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-1 block">
              {t("trainer.focusOptional")}
            </span>
            <input
              value={proposeFocus}
              onChange={(e) => setProposeFocus(e.target.value)}
              placeholder={t("trainer.focusPlaceholder")}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
            />
          </label>
          <button
            type="button"
            onClick={onPropose}
            disabled={busy === "propose"}
            className="bg-primary text-on-primary font-metric-sm text-metric-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy === "propose" ? t("action.sending") : t("trainer.sendProposal")}
          </button>
        </div>
      )}
    </section>
  );
}

function ProgramSection({ programs }: { programs: MemberOverview["program"] }) {
  const { t } = useTranslation();
  const { label, formatWeight } = useUnit();
  if (programs.length === 0) {
    return (
      <section className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="font-metric-sm text-metric-sm text-on-surface mb-2">{t("trainer.yourProgramme")}</h2>
        <p className="font-body-md text-sm text-on-surface-variant">
          {t("trainer.programmePreparing")}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {programs.map((program) => (
        <div
          key={program.id}
          className="bg-surface-container-low border border-outline-variant rounded-xl p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="font-metric-sm text-metric-sm text-on-surface">{program.name}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-label-caps text-label-caps text-primary">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              {t("trainer.fromYourTrainer")}
            </span>
          </div>
          {program.est_duration_minutes && (
            <p className="font-label-caps text-label-caps text-on-surface-variant mb-3">
              ~{program.est_duration_minutes} {t("trainer.minPerSession")}
            </p>
          )}
          {program.notes && (
            <p className="mb-4 font-body-md text-body-md text-on-surface-variant whitespace-pre-line">
              {program.notes}
            </p>
          )}

          <ul className="divide-y divide-outline-variant">
            {program.exercises.map((ex) => (
              <li key={ex.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-body-md text-body-md text-on-surface">
                  {ex.order}. {ex.name ?? "—"}
                </span>
                <span className="font-body-md text-sm text-on-surface-variant">
                  {ex.target_sets ?? "—"} × {ex.target_reps ?? "—"}
                  {ex.target_weight_kg !== null &&
                    ` @ ${formatWeight(ex.target_weight_kg)} ${label}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FeedbackSection({
  feedback,
  onReload,
}: {
  feedback: MemberOverview["feedback"];
  onReload: () => void;
}) {
  const { t, locale } = useTranslation();
  const markRead = async (id: number) => {
    try {
      await apiClient.post(`/my-trainer/feedback/${id}/read`, {});
      onReload();
    } catch {
      // Read state is cosmetic; a failure here must not disrupt the page.
    }
  };

  return (
    <section className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
      <h2 className="font-metric-sm text-metric-sm text-on-surface mb-4">{t("trainer.notesFromTrainer")}</h2>

      {feedback.length === 0 ? (
        <p className="font-body-md text-sm text-on-surface-variant">
          {t("trainer.noNotes")}
        </p>
      ) : (
        <ul className="space-y-3">
          {feedback.map((item) => (
            <li
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.read_at === null
                  ? "border-primary bg-surface-container-lowest"
                  : "border-outline-variant bg-surface-container-lowest"
              }`}
              onMouseEnter={() => item.read_at === null && markRead(item.id)}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-metric-sm text-metric-sm text-on-surface">
                  {item.trainer_name ?? t("trainer.yourTrainer")}
                </span>
                {item.kind === "live" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2 py-0.5 font-label-caps text-label-caps text-on-error-container">
                    <span className="h-1.5 w-1.5 rounded-full bg-error" />
                    {t("trainer.liveSession")}
                  </span>
                )}
                {item.rating !== null && (
                  <span className="inline-flex items-center gap-1 font-label-caps text-label-caps text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px]">star</span>
                    {item.rating}/5
                  </span>
                )}
                {item.created_at && (
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    {new Date(item.created_at).toLocaleString(locale)}
                  </span>
                )}
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">
                {item.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RatingDialog({
  value,
  setValue,
  comment,
  setComment,
  onCancel,
  onSubmit,
  busy,
}: {
  value: number;
  setValue: (v: number) => void;
  comment: string;
  setComment: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("trainer.rateTitle")}
    >
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface p-6">
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-1">
          {t("trainer.rateTitle")}
        </h2>
        <p className="font-body-md text-sm text-on-surface-variant mb-4">
          {t("trainer.rateHint")}
        </p>

        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setValue(n)}
              aria-label={t(n > 1 ? "trainer.starsAria" : "trainer.starAria", { count: n })}
              className="p-1"
            >
              <span
                className={`material-symbols-outlined text-[32px] ${
                  n <= value ? "text-primary" : "text-outline-variant"
                }`}
                style={n <= value ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                star
              </span>
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder={t("trainer.ratingCommentPlaceholder")}
          className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface mb-4"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-outline-variant font-metric-sm text-metric-sm px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || value < 1}
            className="bg-primary text-on-primary font-metric-sm text-metric-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? t("action.sending") : t("trainer.submitRating")}
          </button>
        </div>
      </div>
    </div>
  );
}
