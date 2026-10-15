// API base URL. Set NEXT_PUBLIC_API_URL for deployed environments (Vercel);
// falls back to the local Laravel dev server for local development.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1";

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  /**
   * Machine-readable cause for cases the caller must react to differently from
   * an ordinary HTTP failure. "timeout" is set when the request was aborted by
   * our own deadline rather than answered by the server, so the UI can show a
   * translated "took too long" message instead of a raw AbortError.
   */
  code?: string;

  constructor(message: string, status: number, details?: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

/**
 * How long a request may run before we abort it.
 *
 * There was previously no deadline at all: a server that never answered left
 * `fetch` pending forever, so `finally`/`catch` in callers never ran and the
 * photo-upload spinner span indefinitely with no way out. A deadline turns a
 * hang into a rejection the caller can already handle.
 *
 * 30s is deliberately generous for the ordinary CRUD/GET traffic that shares
 * this helper — long enough that a slow-but-working request is not cut off,
 * short enough that a dead connection surfaces while the user is still looking
 * at the screen. Slow endpoints (a photo upload, whose server-side vision call
 * can legitimately run for ~45s) override it per request via `timeoutMs`.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Request options understood by `api()`, alongside the usual `RequestInit`.
 *
 * `timeoutMs` lets a caller raise or lower the deadline for one call without a
 * second helper; callers that pass a raw `RequestInit` are unaffected.
 */
export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export function isTimeoutError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === "timeout";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

/**
 * The locale the user is currently reading the app in.
 *
 * Read from localStorage for the same reason the i18n provider does: it is what
 * survives a reload, and it is set the moment the language is switched.
 */
function getLocale(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("striv_locale");
  return stored === "en" || stored === "id" ? stored : null;
}

export async function api<T>(
  path: string,
  options: ApiRequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  /*
   * Tell the API which language to answer in.
   *
   * The backend has a SetLocale middleware that resolves the request language
   * from X-Locale first, then the user's saved preference, then Accept-Language.
   * Without this header the request carried none of those signals, so Laravel
   * fell through to its default and every localized server-side string —
   * insight titles, pattern summaries, validation messages — came back in
   * English no matter what the user had chosen. The middleware was complete the
   * whole time; the client simply never sent the signal.
   *
   * Sent alongside Accept-Language so an anonymous request (no token, no stored
   * preference) still negotiates sensibly.
   */
  const locale = getLocale();
  if (locale) {
    headers.set("X-Locale", locale);
    headers.set("Accept-Language", locale);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;

  /*
   * Bound the request so a stalled server cannot leave the promise pending
   * forever. A caller-supplied signal is still honoured: we abort our own
   * controller when theirs fires, so callers that cancel on unmount keep
   * working exactly as before.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    /*
     * A request aborted by our own deadline is not a real API response — it is
     * a hang we chose to end. Surface it as a typed ApiError so callers' existing
     * catch blocks run, and tag it "timeout" so the UI can say "the server took
     * too long" in the user's language rather than leaking an AbortError.
     *
     * An abort caused by the CALLER's own signal is re-thrown untouched: that is
     * a deliberate cancellation, not a failure, and callers handle it already.
     */
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new ApiError(
        `Request timed out after ${timeoutMs}ms`,
        408,
        undefined,
        "timeout"
      );
    }

    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      if (data && typeof data === "object") {
        // Laravel error shape: { message, errors? }
        if ("message" in data) {
          message = String((data as any).message);
          details = data;
        }
        // Validation errors: extract first field message for clarity
        const errors = (data as any).errors;
        if (errors && typeof errors === "object") {
          const firstKey = Object.keys(errors)[0];
          if (firstKey && Array.isArray(errors[firstKey]) && errors[firstKey].length > 0) {
            message = String(errors[firstKey][0]);
          }
        }
      }
    } catch {
      // ignore malformed error payloads
    }
    throw new ApiError(message, res.status, details);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  get<T>(path: string, options?: ApiRequestInit) {
    return api<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: ApiRequestInit) {
    return api<T>(path, {
      ...options,
      method: "POST",
      headers: {
        ...(options?.headers || {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(path: string, body?: unknown, options?: ApiRequestInit) {
    return api<T>(path, {
      ...options,
      method: "PUT",
      headers: {
        ...(options?.headers || {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(path: string, options?: ApiRequestInit) {
    return api<T>(path, { ...options, method: "DELETE" });
  },
};