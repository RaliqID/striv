"use client";

import { useMemo, useState } from "react";

/**
 * A dependency-free trend chart.
 *
 * The admin area has no charting library, and adding one for a single view
 * would pull a few hundred kilobytes into a bundle that is otherwise small, so
 * the geometry is drawn directly as SVG.
 *
 * The plot is stretched to fill its container (`preserveAspectRatio="none"`)
 * so the chart works at any width without a resize observer. That non-uniform
 * scale would squash SVG text and turn circles into ellipses, so every label
 * and point marker is rendered as absolutely-positioned HTML instead, placed
 * by the same viewBox maths expressed as percentages. Lines and grid rules
 * stay in the SVG, where a non-uniform scale is harmless.
 */

export type TrendSeries = {
  key: string;
  label: string;
  values: number[];
  /** Any CSS colour, so the palette can stay in the Tailwind theme. */
  color: string;
  /** Filled under the line. Only the primary series should use this. */
  area?: boolean;
};

type Props = {
  labels: string[];
  series: TrendSeries[];
  height?: number;
  /** Renders a bucket key for the axis and the tooltip header. */
  formatX?: (label: string) => string;
  formatValue?: (value: number) => string;
  /** Shown when there is nothing to plot. */
  emptyLabel: string;
  ariaLabel: string;
};

const WIDTH = 1000;
const PAD_LEFT = 56;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;

/** Round a maximum up to a value that divides into readable ticks. */
function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const norm = value / base;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;

  return step * base;
}

/** Compact axis numbers so a 7-digit volume does not blow out the gutter. */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function TrendChart({
  labels,
  series,
  height = 280,
  formatX,
  formatValue = compact,
  emptyLabel,
  ariaLabel,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const visible = useMemo(() => series.filter((s) => s.values.length > 0), [series]);
  const count = labels.length;

  const geometry = useMemo(() => {
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = height - PAD_TOP - PAD_BOTTOM;

    const peak = visible.reduce(
      (max, s) => s.values.reduce((inner, v) => (v > inner ? v : inner), max),
      0,
    );
    const top = niceMax(peak);

    // A single bucket has no span to interpolate across, so it is pinned to the
    // left edge instead of dividing by zero.
    const stepX = count > 1 ? plotW / (count - 1) : 0;

    const x = (index: number) => PAD_LEFT + index * stepX;
    const y = (value: number) => PAD_TOP + plotH - (value / top) * plotH;

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const value = (top / 4) * i;
      return { value, y: y(value) };
    });

    return { plotW, plotH, top, x, y, ticks, stepX };
  }, [count, height, visible]);

  const paths = useMemo(
    () =>
      visible.map((s) => {
        const points = s.values.map((value, index) => `${geometry.x(index)},${geometry.y(value)}`);
        const line = `M${points.join(" L")}`;
        const area = s.area
          ? `${line} L${geometry.x(s.values.length - 1)},${geometry.y(0)} L${geometry.x(0)},${geometry.y(0)} Z`
          : "";

        return { series: s, line, area };
      }),
    [geometry, visible],
  );

  // Roughly one label per 110 units of width, so the axis never turns into a
  // smear of overlapping dates on a narrow screen.
  const labelStride = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(geometry.plotW / 110))));

  /** viewBox units to container percentages, for the HTML overlay. */
  const leftPct = (index: number) => `${(geometry.x(index) / WIDTH) * 100}%`;
  const topPct = (value: number) => `${(geometry.y(value) / height) * 100}%`;

  if (count === 0 || visible.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-outline-variant"
        style={{ height: 200 }}
      >
        <p className="font-body-md text-body-md text-on-surface-variant">{emptyLabel}</p>
      </div>
    );
  }

  const activeIndex = hover;

  /** Maps a pointer position onto the nearest bucket index. */
  const indexAt = (clientX: number, box: DOMRect) => {
    const units = ((clientX - box.left) / box.width) * WIDTH;
    const raw = geometry.stepX > 0 ? (units - PAD_LEFT) / geometry.stepX : 0;
    return Math.round(Math.min(Math.max(raw, 0), count - 1));
  };

  /** Keyboard equivalent of the hover: arrows walk the buckets, Escape clears. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setHover(null);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const from = hover ?? (event.key === "ArrowLeft" ? count : -1);
    const next = event.key === "ArrowLeft" ? from - 1 : from + 1;
    setHover(Math.min(Math.max(next, 0), count - 1));
  };

  return (
    <div className="relative" style={{ height }}>
      {/* Decorative: the overlay below carries the accessible name, and a
          duplicate label would make screen readers announce the chart twice. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {geometry.ticks.map((tick) => (
          <line
            key={tick.value}
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={tick.y}
            y2={tick.y}
            stroke="currentColor"
            className="text-outline-variant"
            strokeWidth="1"
            strokeDasharray={tick.value === 0 ? undefined : "4 6"}
          />
        ))}

        {activeIndex !== null && (
          <line
            x1={geometry.x(activeIndex)}
            x2={geometry.x(activeIndex)}
            y1={PAD_TOP}
            y2={height - PAD_BOTTOM}
            stroke="currentColor"
            className="text-on-surface-variant"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        )}

        {paths.map(({ series: s, area }) =>
          area ? <path key={`${s.key}-area`} d={area} fill={`url(#trend-fill-${s.key})`} /> : null,
        )}

        {paths.map(({ series: s, line }) => (
          <path
            key={`${s.key}-line`}
            d={line}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Pointer and keyboard surface. A focusable element carries the
          handlers so the wrapper stays a plain layout container, and it owns
          the accessible name now that the SVG is decorative. */}
      <div
        className="absolute inset-0 cursor-crosshair rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => setHover(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()))}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      />

      {/* Y axis: sits just left of the plot, never inside it. */}
      {geometry.ticks.map((tick) => (
        <span
          key={tick.value}
          className="pointer-events-none absolute -translate-y-1/2 pr-2 text-right font-label-caps text-label-caps text-on-surface-variant"
          style={{ left: 0, width: `${((PAD_LEFT - 8) / WIDTH) * 100}%`, top: topPct(tick.value) }}
        >
          {formatValue(tick.value)}
        </span>
      ))}

      {/* X axis. */}
      {labels.map((label, index) =>
        index % labelStride === 0 || index === count - 1 ? (
          <span
            key={`${label}-${index}`}
            className={`pointer-events-none absolute bottom-1 whitespace-nowrap font-label-caps text-label-caps text-on-surface-variant ${
              index === 0
                ? ""
                : index === count - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2"
            }`}
            style={{ left: leftPct(index) }}
          >
            {formatX ? formatX(label) : label}
          </span>
        ) : null,
      )}

      {/* Point markers for the hovered bucket. */}
      {activeIndex !== null &&
        visible.map((s) => (
          <span
            key={`${s.key}-dot`}
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              left: leftPct(activeIndex),
              top: topPct(s.values[activeIndex] ?? 0),
              backgroundColor: s.color,
            }}
          />
        ))}

      {activeIndex !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[9rem] rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-lg"
          style={{
            left: leftPct(activeIndex),
            transform:
              activeIndex > count / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <p className="font-label-caps text-label-caps text-on-surface-variant">
            {formatX ? formatX(labels[activeIndex]) : labels[activeIndex]}
          </p>
          <ul className="mt-2 space-y-1">
            {visible.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 font-body-md text-body-md text-on-surface-variant">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  {s.label}
                </span>
                <span className="font-metric-sm text-metric-sm text-on-surface">
                  {formatValue(s.values[activeIndex] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
