"use client";

import { cn } from "@/lib/utils";

/**
 * Bordered content panel with a consistent header.
 *
 * Every section of the admin area is one of these, so spacing, border and
 * heading levels stay identical across pages instead of being re-typed.
 */
export default function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-outline-variant bg-surface-container-lowest",
        className
      )}
    >
      {(title || action) && (
        <header className="flex flex-col gap-3 border-b border-outline-variant p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="font-metric-sm text-metric-sm text-primary">{title}</h2>}
            {description && (
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{description}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
