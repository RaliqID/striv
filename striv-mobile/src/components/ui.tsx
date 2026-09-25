/**
 * Shared UI primitives.
 *
 * Centralised so spacing, radii, and touch targets stay consistent across
 * screens. Every interactive element here meets a 44pt minimum with hit slop,
 * which is the difference between an app that feels native and one that feels
 * like a website in a wrapper.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, HIT_SLOP, MIN_TAP, radius, spacing, typography } from "../theme";

/* ------------------------------------------------------------------ buttons */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant],
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.onPrimary : colors.text}
        />
      ) : (
        <Text style={[styles.buttonLabel, buttonLabelVariants[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.outline },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  ghost: { backgroundColor: "transparent" },
};

const buttonLabelVariants = {
  primary: { color: colors.onPrimary },
  secondary: { color: colors.text },
  danger: { color: colors.danger },
  ghost: { color: colors.textMuted },
} as const;

/* -------------------------------------------------------------------- cards */

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children.toUpperCase()}</Text>;
}

/* ------------------------------------------------------------------- badges */

type BadgeTone = "neutral" | "success" | "danger" | "warning" | "accent";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  return (
    <View style={[styles.badge, badgeTones[tone].container]}>
      <Text style={[styles.badgeLabel, badgeTones[tone].label]}>{label}</Text>
    </View>
  );
}

const badgeTones = {
  neutral: { container: { backgroundColor: colors.surfaceSunken }, label: { color: colors.textMuted } },
  success: { container: { backgroundColor: colors.successSoft }, label: { color: colors.success } },
  danger: { container: { backgroundColor: colors.dangerSoft }, label: { color: colors.onDangerSoft } },
  warning: { container: { backgroundColor: colors.warningSoft }, label: { color: colors.warning } },
  accent: { container: { backgroundColor: colors.accentSoft }, label: { color: colors.onAccentSoft } },
} as const;

/* ------------------------------------------------------------------- states */

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.stateBox} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.stateText}>{label}…</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.stateText}>{description}</Text> : null}
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.stateBox, styles.errorBox]} accessibilityRole="alert">
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" onPress={onRetry} style={styles.stateAction} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ divider */

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TAP,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...typography.bodyStrong },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.lg,
  },

  sectionTitle: {
    ...typography.caps,
    color: colors.textFaint,
    marginBottom: spacing.sm,
  },

  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  badgeLabel: { ...typography.caption },

  stateBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stateText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  stateAction: { marginTop: spacing.md },
  emptyTitle: { ...typography.heading, color: colors.text, textAlign: "center" },

  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
  },
  errorTitle: { ...typography.bodyStrong, color: colors.onDangerSoft },
  errorText: { ...typography.body, color: colors.onDangerSoft },

  divider: { height: 1, backgroundColor: colors.outlineVariant },
});
