import { apiClient } from "./api";

/**
 * Capture `?token=` from URL (Google OAuth callback redirect), persist it,
 * clean the URL, then hydrate localStorage user from /auth/user.
 * Safe no-op when no token param present.
 */
export async function captureTokenFromUrl(): Promise<void> {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) return;

  localStorage.setItem("token", token);

  params.delete("token");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
  );

  try {
    const me = await apiClient.get<any>("/auth/user");
    if (me) {
      localStorage.setItem("user", JSON.stringify(me));
    }
  } catch {
    // Invalid/expired token — leave localStorage as-is; callers handle 401.
  }
}

export function readStoredUser(): any | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function storeUser(user: unknown): void {
  if (typeof window === "undefined" || user == null) return;
  localStorage.setItem("user", JSON.stringify(user));
}
