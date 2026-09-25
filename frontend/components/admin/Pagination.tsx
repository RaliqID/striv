"use client";

import Button from "./Button";

type Meta = { current_page: number; per_page: number; total: number; last_page: number };

/**
 * Pagination with an explicit range readout.
 *
 * Shows "showing 1–20 of 137" so the operator always knows how much of the
 * data set they are looking at — a bare page number hides whether a filter
 * returned 20 rows out of 20 or out of 20,000.
 */
export default function Pagination({
  meta,
  onPage,
  busy,
}: {
  meta: Meta;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  const from = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const to = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant p-4 sm:flex-row">
      <p className="font-body-md text-body-md text-on-surface-variant">
        Showing <strong className="text-on-surface">{from}</strong>–
        <strong className="text-on-surface">{to}</strong> of{" "}
        <strong className="text-on-surface">{meta.total}</strong>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon="chevron_left"
          disabled={meta.current_page <= 1 || busy}
          onClick={() => onPage(meta.current_page - 1)}
        >
          Previous
        </Button>
        <span className="px-2 font-metric-sm text-metric-sm text-on-surface-variant">
          Page {meta.current_page} of {Math.max(meta.last_page, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.current_page >= meta.last_page || busy}
          onClick={() => onPage(meta.current_page + 1)}
        >
          Next
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            chevron_right
          </span>
        </Button>
      </div>
    </div>
  );
}
