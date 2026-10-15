"use client";

import { apiClient, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from "react";

/**
 * Reminder settings.
 *
 * Split out of the settings page because it is the one section with a real
 * async lifecycle of its own (load, optimistic toggle, save, error), and
 * inlining it would bury the account and biodata forms under a wall of state.
 *
 * The design intent is that everything is reversible and legible: every toggle
 * states what it will send and when, and the history below shows exactly what
 * has already been sent. A member who can see the messages they got, and turn
 * each kind off, is a member who does not report the reminder system as spam.
 */
export default function ReminderSettings() {
  const { t, locale } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [prefs, setPrefs] = useState<{
    channels: {
      email: { enabled: boolean; available: boolean };
      whatsapp: { enabled: boolean; available: boolean; phone: string | null };
    };
    kinds: Record<string, boolean>;
  } | null>(null);

  const [phone, setPhone] = useState("");
  const [history, setHistory] = useState<
    { id: number; kind: string; channel: string; status: string; sent_at: string | null }[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        apiClient.get<typeof prefs>("/reminders/preferences"),
        apiClient.get<{ reminders: typeof history }>("/reminders/history").catch(() => ({ reminders: [] })),
      ]);
      setPrefs(p);
      setPhone(p?.channels.whatsapp.phone ?? "");
      setHistory(h.reminders ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiClient.put<{ preferences: typeof prefs; message: string }>(
        "/reminders/preferences",
        patch
      );
      setPrefs(res.preferences);
      setSaved(true);
      // Clear the confirmation so it does not linger as a permanent label.
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.actionFailed"));
      // Re-read so the UI snaps back to the server's truth if the save failed.
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: "email" | "whatsapp") =>
    save({ [`${channel}_enabled`]: !prefs?.channels[channel].enabled });

  const toggleKind = (kind: string) => save({ [kind]: !prefs?.kinds[kind] });

  const KIND_INFO: Record<string, { labelKey: string; descKey: string; icon: string }> = {
    morning_training: {
      labelKey: "reminders.morning",
      descKey: "reminders.morningDesc",
      icon: "wb_sunny",
    },
    streak_break: {
      labelKey: "reminders.streak",
      descKey: "reminders.streakDesc",
      icon: "trending_down",
    },
    post_workout: {
      labelKey: "reminders.praise",
      descKey: "reminders.praiseDesc",
      icon: "celebration",
    },
    weekly_recap: {
      labelKey: "reminders.weekly",
      descKey: "reminders.weeklyDesc",
      icon: "calendar_view_week",
    },
    missed_session: {
      labelKey: "reminders.missed",
      descKey: "reminders.missedDesc",
      icon: "schedule",
    },
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-surface-container" />;
  }

  if (!prefs) {
    return (
      <div className="rounded-xl border border-outline-variant p-6">
        <p className="text-on-surface-variant">{error ?? t("common.loadFailed")}</p>
        <button onClick={load} className="mt-2 font-semibold text-primary">
          {t("action.retry")}
        </button>
      </div>
    );
  }

  const whatsappReady = prefs.channels.whatsapp.available;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-metric-sm text-metric-sm text-primary">{t("reminders.title")}</h2>
        {saving && (
          <span className="material-symbols-outlined animate-spin text-[18px] text-on-surface-variant">
            progress_activity
          </span>
        )}
        {saved && !saving && (
          <span className="font-label-caps text-label-caps text-primary">{t("toast.saved")}</span>
        )}
      </div>

      <p className="mb-5 font-body-md text-sm text-on-surface-variant">
        {t("reminders.intro")}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-error-container p-3 text-sm text-on-error-container" role="alert">
          {error}
        </div>
      )}

      {/* Channels */}
      <h3 className="mb-2 font-label-caps text-label-caps uppercase text-on-surface-variant">
        {t("reminders.channels")}
      </h3>
      <div className="mb-6 space-y-3">
        <ChannelRow
          icon="mail"
          label={t("reminders.byEmail")}
          hint={t("reminders.byEmailHint")}
          enabled={prefs.channels.email.enabled}
          available={prefs.channels.email.available}
          disabled={saving}
          onToggle={() => toggleChannel("email")}
          t={t}
        />

        <div>
          <ChannelRow
            icon="chat"
            label={t("reminders.byWhatsapp")}
            hint={
              whatsappReady
                ? t("reminders.byWhatsappHint")
                : t("reminders.whatsappUnavailable")
            }
            enabled={prefs.channels.whatsapp.enabled}
            available={whatsappReady}
            disabled={saving}
            onToggle={() => toggleChannel("whatsapp")}
            t={t}
          />

          {/* Phone input appears with the WhatsApp toggle, because the number is
              what makes the channel usable — collecting it elsewhere would
              split one decision across two screens. */}
          {whatsappReady && prefs.channels.whatsapp.enabled && (
            <div className="mt-2 pl-11">
              <label className="mb-1 block font-label-caps text-label-caps text-on-surface-variant">
                {t("reminders.phone")}
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-body-md text-on-surface"
                />
                <button
                  type="button"
                  onClick={() => save({ phone })}
                  disabled={saving}
                  className="rounded-lg border border-outline-variant px-4 py-2 font-metric-sm text-metric-sm text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
                >
                  {t("action.save")}
                </button>
              </div>
              <p className="mt-1 font-body-md text-[12px] text-on-surface-variant">
                {t("reminders.phoneHint")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Kinds */}
      <h3 className="mb-2 font-label-caps text-label-caps uppercase text-on-surface-variant">
        {t("reminders.whatToSend")}
      </h3>
      <div className="space-y-1">
        {Object.entries(KIND_INFO).map(([kind, info]) => (
          <label
            key={kind}
            className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-surface-container-low"
          >
            <input
              type="checkbox"
              checked={prefs.kinds[kind] ?? true}
              disabled={saving}
              onChange={() => toggleKind(kind)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  {info.icon}
                </span>
                <span className="font-body-md text-body-md text-on-surface">
                  {t(info.labelKey)}
                </span>
              </span>
              <span className="mt-0.5 block font-body-md text-[13px] text-on-surface-variant">
                {t(info.descKey)}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* History — the answer to "why am I getting these?" */}
      <div className="mt-6 border-t border-outline-variant pt-4">
        <button
          type="button"
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-2 font-metric-sm text-metric-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <span
            className={`material-symbols-outlined text-[18px] transition-transform ${
              historyOpen ? "rotate-90" : ""
            }`}
          >
            chevron_right
          </span>
          {t("reminders.history")} ({history.length})
        </button>

        {historyOpen && (
          <ul className="mt-3 space-y-1">
            {history.length === 0 ? (
              <li className="font-body-md text-sm text-on-surface-variant">
                {t("reminders.noHistory")}
              </li>
            ) : (
              history.slice(0, 20).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3 rounded border border-outline-variant px-3 py-2"
                >
                  <span className="font-body-md text-sm text-on-surface">
                    {KIND_INFO[h.kind] ? t(KIND_INFO[h.kind].labelKey) : h.kind}
                  </span>
                  <span className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface-variant">
                    <span className="rounded-full bg-surface-container px-2 py-0.5">
                      {h.channel}
                    </span>
                    {h.sent_at && new Date(h.sent_at).toLocaleDateString(locale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  icon,
  label,
  hint,
  enabled,
  available,
  disabled,
  onToggle,
  t,
}: {
  icon: string;
  label: string;
  hint: string;
  enabled: boolean;
  available: boolean;
  disabled: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined mt-0.5 text-[20px] text-on-surface-variant">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-body-md text-body-md text-on-surface">{label}</span>

          {/* A channel with no provider is shown as unavailable rather than as a
              toggle that silently does nothing. */}
          {available ? (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={label}
              disabled={disabled}
              onClick={onToggle}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                enabled ? "bg-primary" : "bg-outline-variant"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
              {t("reminders.notAvailable")}
            </span>
          )}
        </div>
        <p className="mt-0.5 font-body-md text-[13px] text-on-surface-variant">{hint}</p>
      </div>
    </div>
  );
}
