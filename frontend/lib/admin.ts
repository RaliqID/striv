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
 */
export function classifyError(error: unknown): { kind: AdminErrorKind; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return { kind: "unauthorized", message: "Your session has expired. Please sign in again." };
    }
    if (error.status === 403) {
      return { kind: "forbidden", message: "Administrator access required." };
    }
    return { kind: "other", message: error.message || "Something went wrong." };
  }

  return { kind: "other", message: "Could not reach the server. Check your connection." };
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

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 days ago" — relative time reads better than a date for recent activity. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Never";

  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

/** "user.password_reset" -> "Password reset" */
export function humanizeAction(action: string): string {
  const withoutPrefix = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const spaced = withoutPrefix.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
