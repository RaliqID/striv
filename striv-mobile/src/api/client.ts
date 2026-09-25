/**
 * Typed HTTP client for the Striv API.
 *
 * Wraps fetch so every call gets the auth header, consistent error handling, and
 * a timeout. Three behaviours are worth knowing about:
 *
 *  - A 401 clears the stored session and notifies subscribers. Token expiry must
 *    drop the user back to sign-in from anywhere in the app, not just on the
 *    screen that happened to make the failing request.
 *  - Errors are normalised into ApiError so callers can branch on `status`
 *    rather than parsing message strings.
 *  - A timeout is enforced. Without one, a request to an unreachable backend
 *    hangs until the OS gives up, which reads as a frozen app.
 */
import { API_BASE_URL } from "./config";
import { getToken, clearSession } from "../lib/storage";

const TIMEOUT_MS = 20000;

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  /** True when the backend is unreachable rather than rejecting the request. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Subscribe to forced sign-outs (expired or revoked token). */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => listener());
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header (login, register). */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, signal } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Combine the caller's signal with our timeout so either can abort the call.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // Distinguish "we aborted deliberately" from "the network failed".
    if (signal?.aborted) throw new ApiError(0, "Request cancelled.");
    if (controller.signal.aborted) {
      throw new ApiError(0, "The server took too long to respond.");
    }
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }

  if (response.status === 401) {
    await clearSession();
    notifyUnauthorized();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // A non-JSON body means something upstream went wrong (a proxy error page,
      // for instance). Surfacing the raw text beats a parse exception.
      if (!response.ok) throw new ApiError(response.status, text.slice(0, 200));
    }
  }

  if (!response.ok) {
    const data = payload as { message?: string; errors?: Record<string, string[]> } | null;
    const message =
      data?.message ??
      // Prefer the first field error, which is more specific than "invalid data".
      (data?.errors ? Object.values(data.errors)[0]?.[0] : undefined) ??
      `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, data?.errors);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
