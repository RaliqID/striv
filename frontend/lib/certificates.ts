/**
 * Types and fetchers for certificates.
 *
 * Kept beside `progression.ts` rather than inside it so the certificate feature
 * owns its own shapes. The two are related — certificates sit next to badges on
 * the same screen — but they change for different reasons.
 */

import { apiClient } from "@/lib/api";

/** A certificate the member has earned. */
export interface Certificate {
  id: number;
  milestone: "sessions" | "streak" | "strength" | "consistency";
  serial: string;
  member_name: string;
  /** Translation key, e.g. `certificate.milestone.streak.title`. */
  name_key: string;
  subtitle_key: string;
  /** The evidence captured when it was issued. Shape varies by milestone. */
  stats: Record<string, string | number | null> | null;
  trainer_name: string | null;
  issued_at: string | null;
}

/** A milestone not yet completed, with progress toward it. */
export interface LockedMilestone {
  milestone: Certificate["milestone"];
  name_key: string;
  subtitle_key: string;
  threshold: number;
  unit: string;
  progress: number;
}

export interface CertificatesResponse {
  certificates: Certificate[];
  locked: LockedMilestone[];
  count: number;
}

export function fetchCertificates(): Promise<CertificatesResponse> {
  return apiClient.get<CertificatesResponse>("/me/certificates");
}

/**
 * Which stat rows to show for a milestone, and in what order.
 *
 * The keys here are the SNAKE_CASE ones the API actually sends (see the
 * `stats` payload built by CertificateService). An earlier version used
 * camelCase names, so every lookup missed and the certificate printed "—"
 * where the evidence should have been — the numbers were present the whole
 * time, under different names.
 *
 * Driven by the milestone rather than by whatever keys happen to be in `stats`,
 * so the certificate prints a deliberate set of facts in a deliberate order
 * instead of exposing raw JSON order.
 */
export function statRowsFor(milestone: Certificate["milestone"]): string[] {
  switch (milestone) {
    case "sessions":
      return ["sessions", "volume_kg", "first_session"];
    case "streak":
      return ["weeks", "sessions"];
    case "strength":
      return ["records", "exercises"];
    case "consistency":
      return ["month_sessions", "month"];
    default:
      return [];
  }
}

/**
 * Format one evidence value for display.
 *
 * Volume arrives as a number of kilograms and is the only value needing
 * thousands separators; dates arrive as ISO strings and are re-formatted so they
 * follow the member's locale rather than the server's.
 */
export function formatStatValue(key: string, value: string | number | null, locale: string): string {
  if (value === null || value === undefined) return "—";

  if (key === "volume_kg") {
    return `${new Intl.NumberFormat(locale).format(Number(value))} kg`;
  }

  if (key === "month") {
    // Stored as YYYY-MM; render as a month name so it is not read as a code.
    const [y, m] = String(value).split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }

  if (key === "first_session") {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
    }
  }

  return String(value);
}
