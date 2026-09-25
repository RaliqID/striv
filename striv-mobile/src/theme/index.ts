/**
 * Design tokens, mirroring the web app's Material 3 palette.
 *
 * Kept in one place so the native app and the website read as the same product.
 * Values are intentionally literal rather than theme-aware: the app is
 * light-only for now, and a half-implemented dark mode looks worse than none.
 */
export const colors = {
  // Surfaces
  background: "#FDF8F8",
  surface: "#FFFFFF",
  surfaceVariant: "#F4EDED",
  surfaceSunken: "#EEEAEA",
  outline: "#CAC4D0",
  outlineVariant: "#E6E1E5",

  // Text
  text: "#1C1B1B",
  textMuted: "#49454F",
  textFaint: "#79747E",

  // Brand
  primary: "#1C1B1B",
  onPrimary: "#FFFFFF",
  accent: "#6063EE",
  accentSoft: "#E3E3FB",
  onAccentSoft: "#1B1B4D",

  // Status
  success: "#1E7A46",
  successSoft: "#D7F2E1",
  warning: "#8A5A00",
  warningSoft: "#FFEBC7",
  danger: "#B3261E",
  dangerSoft: "#F9DEDC",
  onDangerSoft: "#410E0B",
} as const;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: "900" as const, letterSpacing: -1 },
  title: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.5 },
  heading: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const },
  label: { fontSize: 13, fontWeight: "600" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
  /** Uppercase section labels, matching the web app's label-caps. */
  caps: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.9 },
} as const;

/** Minimum touch target, per Android/iOS accessibility guidance. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TAP = 44;
