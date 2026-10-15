"use client";

import { ApiError } from "@/lib/api";

export type AdminErrorKind = "unauthorized" | "forbidden" | "other";

/**
 * Classify an API failure once, so every admin page reacts identically.
 *
 * Redirect rules live here rather than in each page: a 401 means the session is
 * gone and the only sensible move is back to login, while a 403 means the
 * account is authenticated but not an administrator — a different outcome that
 * needs a different message, not a redirect loop.
 *
 * `t` is optional because this is a plain module function with no hook access.
 * Callers that pass it get a localized message; without it the English form is
 * returned, the same pattern used by formatRelative below.
 */
export function classifyError(
  error: unknown,
  t?: (key: string) => string,
): { kind: AdminErrorKind; message: string } {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { kind: "unauthorized", message: tr("admin.errSessionExpired", "Your session has expired. Please sign in again.") };
    }
    if (error.status === 403) {
      return { kind: "forbidden", message: tr("admin.errAccessRequired", "Administrator access required.") };
    }
    return { kind: "other", message: error.message || tr("admin.errGeneric", "Something went wrong.") };
  }

  return { kind: "other", message: tr("admin.errUnreachable", "Could not reach the server. Check your connection.") };
}

/** Send the browser to login for an expired session. */
export function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

export function formatVolume(value: number | null | undefined): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value ?? 0)} kg`;
}

export function formatDate(value: string | null | undefined, locale?: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "3 days ago" — relative time reads better than a date for recent activity.
 *
 * `t` is optional so existing callers keep working, but any caller that passes
 * it gets a localized result. Without it the English form is returned, which is
 * why the admin panel showed "1d ago" inside an otherwise Indonesian page.
 *
 * The translator is passed in rather than read from a hook because this is a
 * plain module function, not a component — the same pattern used elsewhere for
 * helpers that cannot call hooks.
 */
export function formatRelative(
  value: string | null | undefined,
  t?: (key: string, params?: Record<string, string | number>) => string,
  locale?: string,
): string {
  const tr = (key: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : FALLBACK_RELATIVE[key];

  if (!value) return tr("time.never");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return tr("time.never");

  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return tr("time.justNow");
  if (seconds < 3600) return tr("time.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return tr("time.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 604800) return tr("time.daysAgo", { count: Math.floor(seconds / 86400) });
  return formatDate(value, locale);
}

/**
 * English strings used when no translator is supplied.
 *
 * Kept so a caller that has not been updated still renders readable text rather
 * than a raw key.
 */
const FALLBACK_RELATIVE: Record<string, string> = {
  "time.never": "Never",
  "time.justNow": "Just now",
  "time.minutesAgo": "m ago",
  "time.hoursAgo": "h ago",
  "time.daysAgo": "d ago",
};

/** "user.password_reset" -> "Password reset" */
export function humanizeAction(action: string): string {
  const withoutPrefix = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const spaced = withoutPrefix.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
