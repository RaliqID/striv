"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; tone: "success" | "error" };

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Action feedback for the admin area.
 *
 * Every mutation here ends with either a success or a failure notice — an
 * administrative change that silently succeeds is indistinguishable from one
 * that silently did nothing, which is exactly the confusion an audit-focused
 * panel exists to remove.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    // Errors linger longer: they usually need reading and acting on.
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === "error" ? 7000 : 4000);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 right-4 z-[200] flex w-[min(92vw,22rem)] flex-col gap-2 md:bottom-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border p-3 shadow-lg",
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-error/30 bg-error-container text-on-error-container"
            )}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {toast.tone === "success" ? "check_circle" : "error"}
            </span>
            <p className="font-body-md text-body-md">{toast.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Toast dispatch.
 *
 * Returns no-ops rather than throwing when there is no provider above. Throwing
 * looked like a helpful guardrail but broke server-side prerendering: a page
 * that renders its own layout (which is where the provider lives) calls this
 * hook during render, before that layout's provider exists, so every such page
 * failed to prerender. A toast that silently does nothing during prerender is
 * correct — nothing user-visible happens on the server anyway — and in the
 * browser the provider is always present by the time an action can fire.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  return context ?? { success: () => {}, error: () => {} };
}
