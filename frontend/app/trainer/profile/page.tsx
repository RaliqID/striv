"use client";

import TrainerLayout from "@/components/trainer/TrainerLayout";
import { useToast } from "@/components/admin/Toast";
import { apiClient, ApiError } from "@/lib/api";
import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

/**
 * The trainer's own settings.
 *
 * Specialisation and capacity are not cosmetic: both feed the matcher
 * directly. Changing specialisation changes which members get routed here, and
 * capacity is the hard ceiling that stops this trainer being over-subscribed.
 * The screen says so, because a trainer editing these should understand the
 * consequence rather than treating them as profile decoration.
 */
export default function TrainerProfilePage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [specialization, setSpecialization] = useState("");
  const [bio, setBio] = useState("");
  const [capacity, setCapacity] = useState("");
  const [stats, setStats] = useState<{ clients: number; rating: number | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<{
          trainer: { specialization: string | null; capacity: number; rating: number | null };
          stats: { clients: number };
        }>("/trainer/dashboard");
        setSpecialization(res.trainer.specialization ?? "");
        setCapacity(String(res.trainer.capacity));
        setStats({ clients: res.stats.clients, rating: res.trainer.rating });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t("common.loadFailed"));
      } finally {
        setLoading(false);
      }
      // Bio and specialization come from the same record; the dashboard omits
      // bio, so read it from the cached user rather than adding an endpoint.
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          const u = JSON.parse(stored);
          if (u?.bio) setBio(u.bio);
        }
      } catch {
        // Cache miss just leaves the field blank for the trainer to fill.
      }
    })();
  }, [toast, t]);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put("/trainer/profile", {
        specialization: specialization.trim() || null,
        bio: bio.trim() || null,
        capacity: capacity ? Number(capacity) : null,
      });
      toast.success(t("toast.updated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface";

  return (
    <TrainerLayout
      title={t("settings.trainerTitle")}
      description={t("settings.trainerHint")}
    >
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
            progress_activity
          </span>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="font-label-caps text-label-caps text-on-surface-variant">
                  {t("settings.activeClients")}
                </p>
                <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
                  {stats.clients}
                </p>
              </div>
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <p className="font-label-caps text-label-caps text-on-surface-variant">
                  {t("settings.averageRating")}
                </p>
                <p className="mt-1 font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
                  {stats.rating !== null ? `${stats.rating.toFixed(1)} / 5` : "—"}
                </p>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
            <label className="block">
              <span className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
                {t("settings.specialisation")}
              </span>
              <select
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className={input}
              >
                <option value="">{t("settings.noSpecialisation")}</option>
                <option value="muscle">{t("settings.specMuscle")}</option>
                <option value="strength">{t("settings.specStrength")}</option>
                <option value="endurance">{t("settings.specEndurance")}</option>
              </select>
              <p className="mt-1 font-body-md text-sm text-on-surface-variant">
                {t("settings.specHint")}
              </p>
            </label>

            <label className="block">
              <span className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
                {t("settings.capacity")}
              </span>
              <input
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                type="number"
                min={1}
                max={500}
                className={input}
              />
              <p className="mt-1 font-body-md text-sm text-on-surface-variant">
                {t("settings.capacityHint")}
              </p>
            </label>

            <label className="block">
              <span className="mb-1 block font-label-caps text-label-caps text-on-surface-variant uppercase">
                {t("settings.bio")}
              </span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                placeholder={t("settings.bioPlaceholder")}
                className={input}
              />
              <p className="mt-1 font-body-md text-sm text-on-surface-variant">
                {t("settings.bioHint")}
              </p>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? t("action.saving") : t("settings.saveChanges")}
              </button>
            </div>
          </section>
        </div>
      )}
    </TrainerLayout>
  );
}