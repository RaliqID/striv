"use client";

import { cn } from "@/lib/utils";

/** Consistent three states so no table or panel renders an ambiguous blank. */

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-container" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <span className="material-symbols-outlined text-[32px] text-on-surface-variant" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-3 font-metric-sm text-metric-sm text-on-surface">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm font-body-md text-body-md text-on-surface-variant">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl bg-error-container p-4 text-on-error-container sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-body-md text-body-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-on-error-container/30 px-3 py-2 font-metric-sm text-metric-sm hover:bg-on-error-container/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="rounded-xl border border-outline-variant bg-error-container p-6 text-on-error-container">
      <h2 className="font-headline-lg text-headline-lg">Access denied</h2>
      <p className="mt-2 font-body-md text-body-md">
        This area is available to administrators only.
      </p>
    </div>
  );
}
