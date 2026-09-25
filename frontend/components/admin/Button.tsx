"use client";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary/90",
  secondary: "border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high",
  danger: "border border-error/40 text-error hover:bg-error/5",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 py-2 text-[13px]",
  md: "min-h-11 px-5 py-3",
};

/**
 * The admin area's single button primitive.
 *
 * `busy` disables the control and swaps in a spinner, which is what prevents
 * the double-submit that turns one suspend click into two audit entries.
 */
export default function Button({
  variant = "primary",
  size = "md",
  busy = false,
  disabled,
  icon,
  children,
  className,
  type = "button",
  title,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  icon?: string;
}) {
  const isDisabled = disabled || busy;

  return (
    <button
      type={type}
      disabled={isDisabled}
      title={title}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-metric-sm text-metric-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon && (
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children}
    </button>
  );
}
