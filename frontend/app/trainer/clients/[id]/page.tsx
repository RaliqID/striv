"use client";

import TrainerLayout from "@/components/trainer/TrainerLayout";
import { useToast } from "@/components/admin/Toast";
import { apiClient, ApiError } from "@/lib/api";
import type { ClientDetail, Program } from "@/lib/training";
import { DAY_NAMES } from "@/lib/training";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * One client, in full: profile, live session, programme, history, feedback.
 *
 * The live panel polls on its own cadence while a session is open. Everything
 * else is loaded once — the programme and history only change when the trainer
 * changes them, so re-fetching them on a timer would be wasted work.
 */
export default function ClientDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams<{ id: string }>();
  const clientId = params?.id;
  const toast = useToast();

  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [slots, setSlots] = useState<{ day_of_week: number; focus: string }[]>([
    { day_of_week: 1, focus: "" },
  ]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [programOpen, setProgramOpen] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!clientId) return;
      try {
        const res = await apiClient.get<ClientDetail>(`/trainer/clients/${clientId}`);
        setData(res);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!silent) {
          setError(
            err instanceof ApiError ? err.message : t("client.errLoadClient")
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [clientId, t]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Poll only while a session is actually open.
  useEffect(() => {
    if (!data?.live_session) return;
    const timer = setInterval(() => load(true), 10000);
    return () => clearInterval(timer);
  }, [data?.live_session, load]);

  const sendFeedback = async (attachToSession: boolean) => {
    if (!clientId || !feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
      await apiClient.post(`/trainer/clients/${clientId}/feedback`, {
        message: feedbackText.trim(),
        kind: attachToSession ? "live" : "note",
        workout_session_id: attachToSession ? data?.live_session?.id ?? null : null,
      });
      setFeedbackText("");
      toast.success(attachToSession ? t("client.toastLiveNoteSent") : t("client.toastFeedbackSent"));
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("client.errSendFeedback"));
    } finally {
      setSendingFeedback(false);
    }
  };

  const saveSchedule = async () => {
    if (!clientId) return;
    const cleaned = slots.filter((s) => s.focus.trim());
    if (cleaned.length === 0) {
      toast.error(t("client.errNoSlot"));
      return;
    }
    setSavingSchedule(true);
    try {
      await apiClient.put(`/trainer/clients/${clientId}/schedule`, {
        slots: cleaned.map((s) => ({
          day_of_week: s.day_of_week,
          focus: s.focus.trim() || null,
        })),
      });
      toast.success(t("toast.scheduleSent"));
      setScheduleOpen(false);
      await load(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("client.errSaveSchedule"));
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <TrainerLayout title={t("panel.statClients")}>
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
            progress_activity
          </span>
        </div>
      </TrainerLayout>
    );
  }

  if (error || !data) {
    return (
      <TrainerLayout title={t("panel.statClients")}>
        <div className="rounded-lg bg-error-container p-4 text-sm text-on-error-container" role="alert">
          {error ?? t("client.notFound")}
        </div>
        <Link
          href="/trainer"
          className="mt-4 inline-block font-metric-sm text-metric-sm text-primary hover:underline"
        >
          {t("client.backToClients")}
        </Link>
      </TrainerLayout>
    );
  }

  const { client, assignment, schedule, program, stats, recent_sessions, live_session, feedback } =
    data;

  return (
    <TrainerLayout
      title={client.name}
      description={
        [
          client.profile?.primary_goal,
          client.profile?.experience_level,
          assignment.confirmed ? t("trainer.scheduleConfirmed") : t("trainer.awaitingSchedule"),
        ]
          .filter(Boolean)
          .join(" · ")
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => setScheduleOpen(!scheduleOpen)}
            className="rounded-lg border border-outline-variant px-4 py-2 font-metric-sm text-metric-sm text-on-surface transition-colors hover:bg-surface-container-low"
          >
            {scheduleOpen ? t("action.cancel") : t("client.editSchedule")}
          </button>
          <button
            type="button"
            onClick={() => setProgramOpen(!programOpen)}
            className="rounded-lg bg-primary px-4 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90"
          >
            {programOpen ? t("action.cancel") : t("client.assignProgramme")}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Live session — the top of the page when it matters most. */}
        {live_session ? (
          <section className="rounded-xl border border-primary bg-primary/5 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <h2 className="font-metric-sm text-metric-sm text-on-surface">
                Training now · {live_session.elapsed_minutes} min
              </h2>
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                {live_session.totals.sets} sets · {live_session.totals.volume_kg} kg volume
              </span>
            </div>

            <ul className="space-y-3">
              {live_session.exercises.map((ex) => (
                <li key={ex.id} className="rounded-lg bg-surface p-3">
                  <p className="font-metric-sm text-metric-sm text-on-surface">{ex.name ?? "—"}</p>
                  {ex.sets.length === 0 ? (
                    <p className="font-body-md text-sm text-on-surface-variant">{t("client.noSetsYet")}</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {ex.sets.map((s, i) => (
                        <span
                          key={s.id}
                          className="rounded border border-outline-variant px-2 py-0.5 font-body-md text-sm text-on-surface-variant"
                        >
                          {i + 1}. {s.weight_kg ?? "—"}kg × {s.reps ?? "—"}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Live coaching input, attached to the open session. */}
            <div className="mt-4 rounded-lg border border-primary/40 bg-surface p-3">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={2}
                placeholder={t("client.livePlaceholder")}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => sendFeedback(true)}
                  disabled={sendingFeedback || !feedbackText.trim()}
                  className="rounded-lg bg-primary px-4 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {sendingFeedback ? t("action.sending") : t("client.sendLiveNote")}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">bedtime</span>
              <p className="font-body-md text-body-md">{t("client.notTrainingNow")}</p>
            </div>
          </section>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("client.workouts")} value={String(stats.workouts_total)} />
          <Stat label={t("client.last30")} value={String(stats.workouts_30d)} />
          <Stat label={t("client.totalSets")} value={String(stats.sets_total)} />
          <Stat label={t("client.volume")} value={`${Math.round(stats.volume_total_kg)} kg`} />
        </div>

        {/* Schedule editor */}
        {scheduleOpen && (
          <section className="rounded-xl border border-primary bg-surface-container-low p-5">
            <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">
              {t("client.weeklySchedule")}
            </h2>
            <div className="space-y-3">
              {slots.map((slot, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]">
                  <select
                    value={slot.day_of_week}
                    onChange={(e) => {
                      const next = [...slots];
                      next[i] = { ...next[i], day_of_week: Number(e.target.value) };
                      setSlots(next);
                    }}
                    className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
                  >
                    {Object.entries(DAY_NAMES).map(([num]) => (
                      <option key={num} value={num}>
                        {t(`day.${num}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={slot.focus}
                    onChange={(e) => {
                      const next = [...slots];
                      next[i] = { ...next[i], focus: e.target.value };
                      setSlots(next);
                    }}
                    placeholder={t("trainer.focusPlaceholder")}
                    className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
                  />
                  <button
                    type="button"
                    onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                    aria-label={t("client.removeSlot")}
                    className="rounded-lg border border-outline-variant px-3 py-2 text-on-surface-variant transition-colors hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSlots([...slots, { day_of_week: 3, focus: "" }])
                }
                className="rounded-lg border border-dashed border-outline-variant px-4 py-2 font-metric-sm text-metric-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
              >
                + Add day
              </button>
              <button
                type="button"
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="rounded-lg bg-primary px-4 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {savingSchedule ? t("action.sending") : t("client.sendToClient")}
              </button>
            </div>
            <p className="mt-2 font-body-md text-sm text-on-surface-variant">
              {t("client.scheduleHint")}
            </p>
          </section>
        )}

        {/* Programme builder */}
        {programOpen && (
          <ProgramBuilder
            clientId={client.id}
            onSaved={async () => {
              setProgramOpen(false);
              await load(true);
            }}
            onError={(m) => toast.error(m)}
          />
        )}

        {/* Current programme */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">
            {t("client.assignedProgramme")}
          </h2>
          {program.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("client.noProgramme")} {t("client.buildOne")} {client.profile?.primary_goal ?? t("client.theirGoal")}.
            </p>
          ) : (
            <div className="space-y-4">
              {program.map((p) => (
                <ProgramCard
                  key={p.id}
                  program={p}
                  onRemove={async () => {
                    try {
                      await apiClient.delete(`/trainer/clients/${client.id}/program/${p.id}`);
                      toast.success(t("toast.programRemoved"));
                      await load(true);
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : t("client.errRemove"));
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Schedule (read-only view) */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">
            {t("client.confirmedSchedule")}
          </h2>
          {schedule.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("client.noScheduleSet")}
            </p>
          ) : (
            <ul className="space-y-2">
              {schedule.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-3"
                >
                  <div>
                    <span className="font-metric-sm text-metric-sm text-on-surface">
                      {t(`day.${s.day_of_week}`) === `day.${s.day_of_week}` ? s.day_name : t(`day.${s.day_of_week}`)}
                    </span>
                    {s.focus && (
                      <p className="font-body-md text-sm text-on-surface-variant">{s.focus}</p>
                    )}
                  </div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    {s.confirmed_at
                      ? t("trainer.confirmed")
                      : s.proposed_by === "member"
                        ? t("client.clientProposed")
                        : t("client.awaitingClient")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Session history */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">{t("client.recentSessions")}</h2>
          {recent_sessions.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("client.noSessions")}
            </p>
          ) : (
            <ul className="space-y-3">
              {recent_sessions.map((s) => (
                <li key={s.id} className="rounded-lg bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-metric-sm text-metric-sm text-on-surface">
                      {s.finished_at ? new Date(s.finished_at).toLocaleString(locale) : "—"}
                    </span>
                    <span className="font-body-md text-sm text-on-surface-variant">
                      {s.totals.sets} sets · {s.totals.volume_kg} kg ·{" "}
                      {s.duration_minutes ? `${s.duration_minutes} min` : "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.exercises.map((ex, i) => (
                      <span
                        key={i}
                        className="rounded border border-outline-variant px-2 py-0.5 font-body-md text-sm text-on-surface-variant"
                      >
                        {ex.name}
                      </span>
                    ))}
                  </div>

                  {/*
                    Photo evidence per set.

                    This is what turns the session from a claim into a record.
                    Each set shows the photo that proved it, with the AI verdict
                    visible so the trainer can tell a confident match from a
                    photo the system could not check. An unverified photo is
                    flagged because that is exactly the one a human should look at.
                  */}
                  {s.exercises.some((ex) => ex.sets.some((set) => set.photo)) && (
                    <div className="mt-3 border-t border-outline-variant pt-3">
                      <p className="mb-2 font-label-caps text-label-caps uppercase text-on-surface-variant">
                        {t("client.photoEvidence")}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {s.exercises.flatMap((ex) =>
                          ex.sets
                            .filter((set) => set.photo)
                            .map((set) => (
                              <figure key={set.id} className="w-24">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={set.photo!.url}
                                  alt={t("client.setPhotoAlt", { name: ex.name ?? "" })}
                                  className="h-24 w-24 rounded-lg border border-outline-variant object-cover"
                                  loading="lazy"
                                />
                                <figcaption className="mt-1">
                                  <span className="block truncate font-body-md text-[11px] text-on-surface-variant">
                                    {ex.name}
                                  </span>
                                  <span
                                    className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-label-caps text-[10px] ${
                                      set.photo!.unverified
                                        ? "bg-tertiary-container text-on-tertiary-container"
                                        : set.photo!.verdict === "plausible"
                                          ? "bg-primary/10 text-primary"
                                          : "bg-surface-container-high text-on-surface-variant"
                                    }`}
                                    title={set.photo!.analysis ?? undefined}
                                  >
                                    {set.photo!.unverified
                                      ? t("photo.unverifiedTag")
                                      : set.photo!.verdict}
                                  </span>
                                </figcaption>
                              </figure>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* General feedback composer (only when not live). */}
        {!live_session && (
          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
            <h2 className="mb-3 font-metric-sm text-metric-sm text-on-surface">{t("client.sendFeedback")}</h2>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
              placeholder={t("client.feedbackPlaceholder")}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => sendFeedback(false)}
                disabled={sendingFeedback || !feedbackText.trim()}
                className="rounded-lg bg-primary px-4 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {sendingFeedback ? t("action.sending") : t("client.sendFeedback")}
              </button>
            </div>
          </section>
        )}

        {/* Feedback history */}
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">{t("client.feedbackHistory")}</h2>
          {feedback.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t("client.noFeedback")}
            </p>
          ) : (
            <ul className="space-y-3">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-lg bg-surface p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {f.kind === "live" && (
                      <span className="rounded-full bg-error-container px-2 py-0.5 font-label-caps text-label-caps text-on-error-container">
                        {t("panel.live")}
                      </span>
                    )}
                    {f.rating !== null && (
                      <span className="inline-flex items-center gap-1 font-label-caps text-label-caps text-on-surface-variant">
                        <span className="material-symbols-outlined text-[14px]">star</span>
                        Client rated {f.rating}/5
                      </span>
                    )}
                    <span className="font-label-caps text-label-caps text-on-surface-variant">
                      {f.created_at ? new Date(f.created_at).toLocaleString(locale) : ""}
                    </span>
                    {f.read_at && (
                      <span className="font-label-caps text-label-caps text-primary">{t("client.read")}</span>
                    )}
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant whitespace-pre-line">
                    {f.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </TrainerLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <p className="font-label-caps text-label-caps text-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{value}</p>
    </div>
  );
}

function ProgramCard({ program, onRemove }: { program: Program; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-outline-variant bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-metric-sm text-metric-sm text-on-surface">{program.name}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="font-metric-sm text-metric-sm text-on-surface-variant transition-colors hover:text-error"
        >
          {t("action.remove")}
        </button>
      </div>
      {program.est_duration_minutes && (
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          ~{program.est_duration_minutes} min
        </p>
      )}
      {program.notes && (
        <p className="mt-2 font-body-md text-sm text-on-surface-variant whitespace-pre-line">
          {program.notes}
        </p>
      )}
      <ul className="mt-3 divide-y divide-outline-variant">
        {program.exercises.map((ex) => (
          <li key={ex.id} className="flex items-center justify-between py-2">
            <span className="font-body-md text-body-md text-on-surface">
              {ex.order}. {ex.name}
            </span>
            <span className="font-body-md text-sm text-on-surface-variant">
              {ex.target_sets ?? "—"} × {ex.target_reps ?? "—"}
              {ex.target_weight_kg !== null && ` @ ${ex.target_weight_kg} kg`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Programme builder.
 *
 * The trainer picks exercises from the real catalogue and sets the targets —
 * this is the "trainer builds the plan" step that replaces the old onboarding
 * step where the member was asked to guess kg/reps themselves.
 */
function ProgramBuilder({
  clientId,
  onSaved,
  onError,
}: {
  clientId: number;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; equipment?: string | null }[]>([]);
  const [picked, setPicked] = useState<
    { exercise_id: number; name: string; sets: string; reps: string; weight: string }[]
  >([]);
  const [saving, setSaving] = useState(false);

  // Debounced catalogue search.
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ data: { id: number; name: string; equipment?: string | null }[] }>(
          `/exercises?search=${encodeURIComponent(term)}`
        );
        setResults((res?.data ?? []).slice(0, 15));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const save = async () => {
    if (!name.trim()) {
      onError(t("client.errNoName"));
      return;
    }
    if (picked.length === 0) {
      onError(t("client.errNoExercise"));
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`/trainer/clients/${clientId}/program`, {
        name: name.trim(),
        notes: notes.trim() || null,
        est_duration_minutes: duration ? Number(duration) : null,
        exercises: picked.map((p) => ({
          exercise_id: p.exercise_id,
          target_sets: p.sets ? Number(p.sets) : null,
          target_reps: p.reps ? Number(p.reps) : null,
          target_weight_kg: p.weight ? Number(p.weight) : null,
        })),
      });
      await onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t("client.errSaveProgramme"));
    } finally {
      setSaving(false);
    }
  };

  const input =
    "rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface";

  return (
    <section className="rounded-xl border border-primary bg-surface-container-low p-5">
      <h2 className="mb-4 font-metric-sm text-metric-sm text-on-surface">
        {t("client.buildProgramme")}
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("client.programmeName")}
          className={`${input} sm:col-span-2`}
        />
        <input
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          type="number"
          min={1}
          placeholder={t("client.minutesPerSession")}
          className={input}
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder={t("client.coachingNotes")}
        className={`${input} mt-3 w-full`}
      />

      <div className="mt-4">
        <label className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
          {t("client.addExercises")}
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("client.searchCatalogue")}
          className={`${input} w-full`}
        />
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-outline-variant bg-surface">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked([
                      ...picked,
                      { exercise_id: r.id, name: r.name, sets: "3", reps: "8", weight: "" },
                    ]);
                    setSearch("");
                    setResults([]);
                  }}
                  className="w-full px-4 py-2 text-left font-body-md text-body-md text-on-surface transition-colors hover:bg-surface-container-low"
                >
                  {r.name}
                  {r.equipment && (
                    <span className="text-on-surface-variant"> · {r.equipment}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-4 space-y-2">
          {picked.map((p, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg bg-surface p-3 sm:grid-cols-[1fr_70px_70px_90px_auto]"
            >
              <span className="self-center font-body-md text-body-md text-on-surface">{p.name}</span>
              <input
                value={p.sets}
                onChange={(e) => {
                  const n = [...picked];
                  n[i] = { ...n[i], sets: e.target.value };
                  setPicked(n);
                }}
                type="number"
                placeholder={t("client.sets")}
                className={input}
              />
              <input
                value={p.reps}
                onChange={(e) => {
                  const n = [...picked];
                  n[i] = { ...n[i], reps: e.target.value };
                  setPicked(n);
                }}
                type="number"
                placeholder={t("client.reps")}
                className={input}
              />
              <input
                value={p.weight}
                onChange={(e) => {
                  const n = [...picked];
                  n[i] = { ...n[i], weight: e.target.value };
                  setPicked(n);
                }}
                type="number"
                step="0.5"
                placeholder="kg"
                className={input}
              />
              <button
                type="button"
                onClick={() => setPicked(picked.filter((_, j) => j !== i))}
                aria-label={t("routines.removeAria", { name: p.name })}
                className={`${input} text-on-surface-variant transition-colors hover:text-error`}
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? t("client.assigning") : t("client.assignProgramme")}
        </button>
      </div>
    </section>
  );
}
