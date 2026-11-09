import { apiClient } from "./api";

export interface ExchangeOAuthResponse {
  user: any;
  token: string;
}

export async function exchangeOAuthCode(code: string): Promise<ExchangeOAuthResponse> {
  return apiClient.post<ExchangeOAuthResponse>("/auth/exchange-token", { code });
}

/**
 * Capture `?code=` (secure flow) or `?token=` (legacy fallback) from URL
 * (Google OAuth callback redirect), persist it, clean the URL, then hydrate
 * localStorage user.
 * Safe no-op when no code or token param present.
 */
export async function captureTokenFromUrl(): Promise<void> {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const token = params.get("token");

  if (!code && !token) return;

  if (code) {
    try {
      const data = await exchangeOAuthCode(code);
      if (data?.token) {
        localStorage.setItem("token", data.token);
      }
      if (data?.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
    } catch {
      // Failed/expired exchange code: leave storage untouched
    }
    params.delete("code");
  } else if (token) {
    // Legacy fallback
    localStorage.setItem("token", token);
    params.delete("token");

    try {
      const me = await apiClient.get<any>("/auth/user");
      if (me) {
        localStorage.setItem("user", JSON.stringify(me));
      }
    } catch {
      // Invalid/expired token — leave localStorage as-is; callers handle 401.
    }
  }

  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
  );
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
