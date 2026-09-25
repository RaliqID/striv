"use client";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  /** Enables the sort control and sends this key to the API. */
  sortKey?: string;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => React.ReactNode;
};

/**
 * Table with sortable headers.
 *
 * Horizontal scroll is handled inside the panel so a wide table never pushes
 * the whole page sideways, and the sort control is a real button carrying
 * aria-sort so the state is announced rather than only coloured.
 */
export default function DataTable<T extends { id: number | string }>({
  columns,
  rows,
  sort,
  order,
  onSort,
  empty,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  sort?: string;
  order?: "asc" | "desc";
  onSort?: (key: string) => void;
  empty?: React.ReactNode;
  loading?: boolean;
}) {
  if (loading) return null;
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant">
            {columns.map((column) => {
              const isSorted = sort != null && column.sortKey === sort;
              const sortable = Boolean(column.sortKey && onSort);
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={isSorted ? (order === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "px-4 py-3 font-label-caps text-label-caps text-on-surface-variant",
                    column.align === "right" && "text-right",
                    column.className
                  )}
                >
                  {sortable ? (
                    <button
                      onClick={() => onSort?.(column.sortKey as string)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded font-label-caps text-label-caps transition-colors hover:text-on-surface",
                        column.align === "right" && "flex-row-reverse",
                        isSorted && "text-primary"
                      )}
                    >
                      {column.header}
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        {isSorted ? (order === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-outline-variant/60 transition-colors last:border-0 hover:bg-surface-container-low"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle font-body-md text-body-md text-on-surface",
                    column.align === "right" && "text-right",
                    column.className
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
