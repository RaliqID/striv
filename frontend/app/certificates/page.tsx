"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { useTranslation } from "@/lib/i18n/provider";
import {
  Certificate,
  CertificatesResponse,
  LockedMilestone,
  fetchCertificates,
  formatStatValue,
  statRowsFor,
} from "@/lib/certificates";

/**
 * Certificates earned by completing a milestone in full.
 *
 * Two deliberate choices:
 *
 * 1. Locked milestones are listed alongside earned ones, with real progress.
 *    A page showing only what you already have is a filing cabinet; showing the
 *    next one with "62 of 100 sessions" is what makes it a goal.
 *
 * 2. Each certificate can be downloaded as a printable document. A certificate
 *    that only exists inside the app is a badge with a longer name — the point
 *    of certifying a milestone is that the member can keep or show it.
 */
export default function CertificatesPage() {
  // `locale` is not destructured here: the only places this page formats a date
  // are the download canvas and the card component, and both obtain the locale
  // in their own scope (the canvas reads documentElement.lang, the card calls
  // useTranslation itself). Keeping it here produced an unused variable.
  const { t } = useTranslation();
  const router = useRouter();

  const [data, setData] = useState<CertificatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchCertificates();
      // Narrow rather than trust: a malformed body must not blank the page.
      setData({
        certificates: Array.isArray(res?.certificates) ? res.certificates : [],
        locked: Array.isArray(res?.locked) ? res.locked : [],
        count: typeof res?.count === "number" ? res.count : 0,
      });
    } catch (err: any) {
      if (err?.status === 401) {
        router.push("/login");
        return;
      }
      setError(err?.message || t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    load();
  }, [load]);

  const earned = data?.certificates ?? [];
  const locked = data?.locked ?? [];

  return (
    <AppLayout>
      <div className="flex animate-fadeIn flex-col gap-6">
        <header>
          <h1 className="font-metric-display text-headline-lg-mobile tracking-tight text-primary md:text-metric-display">
            {t("certificate.title")}
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t("certificate.subtitle")}
          </p>
        </header>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-xl border border-outline-variant bg-surface"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <p className="font-body-md text-body-md text-on-surface-variant">{error}</p>
            <button
              onClick={load}
              className="rounded-full bg-primary px-6 py-2 font-medium text-on-primary transition-colors hover:bg-primary/80"
            >
              {t("action.retry")}
            </button>
          </div>
        ) : (
          <>
            {earned.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface px-6 py-12 text-center">
                <span className="material-symbols-outlined text-5xl text-outline" aria-hidden="true">
                  workspace_premium
                </span>
                <p className="font-metric-sm text-metric-sm text-on-surface">
                  {t("certificate.none")}
                </p>
                <p className="max-w-md font-body-md text-body-md text-on-surface-variant">
                  {t("certificate.noneBody")}
                </p>
              </div>
            )}

            {earned.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                  {t("certificate.earnedCount", {
                    earned: earned.length,
                    total: earned.length + locked.length,
                  })}
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                  {earned.map((cert) => (
                    <EarnedCertificate
                      key={cert.id}
                      cert={cert}
                      busy={busyId === cert.id}
                      onDownload={() => download(cert, t, setBusyId)}
                    />
                  ))}
                </div>
              </section>
            )}

            {locked.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                  {t("certificate.locked")}
                </h2>

                <div className="grid gap-3 md:grid-cols-2">
                  {locked.map((m) => (
                    <LockedCard key={m.milestone} milestone={m} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * Render a certificate to a PNG and hand it to the browser.
 *
 * Drawn on a `<canvas>` rather than screenshotted from the DOM: there is no
 * screenshot API available to a page, and the alternative — pulling in a
 * rendering library — is a dependency this project does not take. Drawing it
 * also means the exported file is exactly the intended artefact rather than the
 * member's window size and theme.
 *
 * The canvas is rendered at 2x and scaled down, so text stays sharp when printed.
 */
async function download(
  cert: Certificate,
  t: (key: string, vars?: Record<string, any>) => string,
  setBusy: (id: number | null) => void
) {
  setBusy(cert.id);

  try {
    const W = 1400;
    const H = 990;
    const SCALE = 2;

    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(SCALE, SCALE);

    // Paper, then a rule border inset from the edge.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 3;
    ctx.strokeRect(48, 48, W - 96, H - 96);
    ctx.strokeStyle = "#c9c9c9";
    ctx.lineWidth = 1;
    ctx.strokeRect(62, 62, W - 124, H - 124);

    ctx.textAlign = "center";

    // Brand
    ctx.fillStyle = "#0b0b0b";
    ctx.font = "700 30px Inter, system-ui, sans-serif";
    ctx.fillText("STRIV", W / 2, 150);

    // Heading
    ctx.font = "400 20px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#5a5a5a";
    ctx.fillText(t("certificate.title").toUpperCase(), W / 2, 200);

    // Member name
    ctx.fillStyle = "#0b0b0b";
    ctx.font = "700 58px Inter, system-ui, sans-serif";
    ctx.fillText(cert.member_name, W / 2, 300);

    // Rule under the name
    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 260, 330);
    ctx.lineTo(W / 2 + 260, 330);
    ctx.stroke();

    // Milestone
    ctx.font = "600 44px Inter, system-ui, sans-serif";
    ctx.fillText(t(cert.name_key), W / 2, 410);

    ctx.font = "400 22px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#5a5a5a";
    ctx.fillText(t(cert.subtitle_key), W / 2, 452);

    /* Evidence, laid out in a row. Wrapped to two rows so a milestone with
       three facts does not run off the edge. */
    const rows = statRowsFor(cert.milestone);
    const stats = cert.stats ?? {};
    const locale = typeof document !== "undefined" ? document.documentElement.lang || "id" : "id";

    const perRow = 3;
    rows.forEach((key, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const count = Math.min(perRow, rows.length - row * perRow);
      const slotW = W / (count + 1);
      const cx = slotW * (col + 1);
      const cy = 560 + row * 110;

      ctx.fillStyle = "#0b0b0b";
      ctx.font = "700 34px Inter, system-ui, sans-serif";
      ctx.fillText(formatStatValue(key, stats[key] ?? null, locale), cx, cy);

      ctx.fillStyle = "#7a7a7a";
      ctx.font = "400 17px Inter, system-ui, sans-serif";
      ctx.fillText(t(`certificate.stat.${key}`), cx, cy + 28);
    });

    // Signature and serial
    ctx.textAlign = "left";
    ctx.fillStyle = "#0b0b0b";
    ctx.font = "600 20px Inter, system-ui, sans-serif";
    ctx.fillText(cert.trainer_name ?? "Striv", 110, H - 150);

    ctx.strokeStyle = "#0b0b0b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(110, H - 138);
    ctx.lineTo(430, H - 138);
    ctx.stroke();

    ctx.fillStyle = "#7a7a7a";
    ctx.font = "400 15px Inter, system-ui, sans-serif";
    ctx.fillText(
      cert.trainer_name ? t("certificate.signedBy", { name: cert.trainer_name }) : "Striv",
      110,
      H - 118
    );

    ctx.textAlign = "right";
    ctx.font = "400 15px Inter, system-ui, sans-serif";
    ctx.fillText(t("certificate.serial", { serial: cert.serial }), W - 110, H - 150);

    const issued = cert.issued_at
      ? new Date(cert.issued_at).toLocaleDateString(locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    if (issued) ctx.fillText(t("certificate.issuedOn", { date: issued }), W - 110, H - 118);

    // Hand off to the browser.
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.serial}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setBusy(null);
  }
}

/** A completed certificate. */
function EarnedCertificate({
  cert,
  busy,
  onDownload,
}: {
  cert: Certificate;
  busy: boolean;
  onDownload: () => void;
}) {
  const { t, locale } = useTranslation();
  const rows = statRowsFor(cert.milestone);
  const stats = cert.stats ?? {};

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <span
          className="material-symbols-outlined text-[32px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          workspace_premium
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-metric-sm text-metric-sm text-on-surface">{t(cert.name_key)}</p>
          <p className="font-label-caps text-label-caps text-on-surface-variant">
            {t(cert.subtitle_key)}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {rows.map((key) => (
            <div key={key}>
              <p className="font-metric-sm text-metric-sm text-on-surface">
                {formatStatValue(key, stats[key] ?? null, locale)}
              </p>
              <p className="font-label-caps text-label-caps text-on-surface-variant">
                {t(`certificate.stat.${key}`)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-outline-variant pt-3 font-label-caps text-label-caps text-on-surface-variant">
        <span>{t("certificate.serial", { serial: cert.serial })}</span>
        {cert.issued_at && (
          <span>
            {t("certificate.issuedOn", {
              date: new Date(cert.issued_at).toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}
          </span>
        )}
        {cert.trainer_name && (
          <span>{t("certificate.signedBy", { name: cert.trainer_name })}</span>
        )}
      </div>

      <button
        onClick={onDownload}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 font-metric-sm text-metric-sm text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          download
        </span>
        {busy ? t("certificate.downloading") : t("certificate.download")}
      </button>
    </div>
  );
}

/** A milestone not yet completed, with a progress bar. */
function LockedCard({ milestone }: { milestone: LockedMilestone }) {
  const { t } = useTranslation();

  // Guard the divisor: a zero threshold would otherwise render NaN%.
  const pct =
    milestone.threshold > 0
      ? Math.min(100, Math.round((milestone.progress / milestone.threshold) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden="true">
          lock
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-metric-sm text-metric-sm text-on-surface-variant">
            {t(milestone.name_key)}
          </p>
          <p className="font-label-caps text-label-caps text-on-surface-variant">
            {t(milestone.subtitle_key)}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-label-caps text-label-caps text-on-surface-variant">
          {t("certificate.progress", {
            current: milestone.progress,
            target: milestone.threshold,
            unit: t(`certificate.stat.${unitKeyFor(milestone.milestone)}`),
          })}
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t(milestone.name_key)}
        >
          <div className="h-full rounded-full bg-primary/50 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Which stat label names a milestone's unit.
 *
 * The server reports a unit slug ("weeks", "records", "month_sessions") that
 * does not always match a stat key, so it is mapped explicitly rather than
 * assumed to be one.
 */
function unitKeyFor(milestone: LockedMilestone["milestone"]): string {
  switch (milestone) {
    case "sessions":
      return "sessions";
    case "streak":
      return "weeks";
    case "strength":
      return "records";
    case "consistency":
      return "monthSessions";
    default:
      return "sessions";
  }
}
