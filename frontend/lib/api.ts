const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

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
  get<T>(path: string, options?: RequestInit) {
    return api<T>(path, { ...options, method: "GET" });
  },
  post<T>(path: string, body?: unknown, options?: RequestInit) {
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
  put<T>(path: string, body?: unknown, options?: RequestInit) {
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
  delete<T>(path: string, options?: RequestInit) {
    return api<T>(path, { ...options, method: "DELETE" });
  },
};