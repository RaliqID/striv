/**
 * Sign-in screen.
 *
 * Handles the two failure shapes the API distinguishes, because they need
 * different responses from the user:
 *
 *   - 422: the credentials were rejected â†’ show it against the form.
 *   - 403: the account is suspended â†’ a different message, and retrying with the
 *     same password is pointless, so it is shown prominently.
 *   - 429: rate limited (the API throttles per IP and per account). The server
 *     sends Retry-After, which is surfaced so the user is not left guessing.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../src/api/client";
import { Button } from "../src/components/ui";
import { useAuth } from "../src/hooks/useAuth";
import { colors, radius, spacing, typography } from "../src/theme";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    setSuspended(false);

    try {
      await signIn(email, password);
      // Navigation is handled by the router once auth status changes, so there
      // is nothing to do here on success.
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 403) {
          setSuspended(true);
          setError(caught.message);
        } else if (caught.status === 429) {
          setError(caught.message);
        } else {
          setError(caught.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logo} accessibilityElementsHidden>
            <View style={[styles.bar, { height: 12, opacity: 0.55 }]} />
            <View style={[styles.bar, { height: 20, opacity: 0.8 }]} />
            <View style={[styles.bar, { height: 28 }]} />
          </View>
          <Text style={styles.wordmark}>Striv</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to keep tracking your training.</Text>

        {error ? (
          <View
            style={[styles.alert, suspended ? styles.alertDanger : styles.alertNeutral]}
            accessibilityRole="alert"
          >
            <Text style={suspended ? styles.alertDangerText : styles.alertNeutralText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            editable={!busy}
            returnKeyType="next"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={styles.input}
          />
        </View>

        <Button
          label="Sign in"
          onPress={submit}
          busy={busy}
          disabled={!canSubmit}
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, flexGrow: 1, justifyContent: "center" },

  brand: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xxl },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    paddingBottom: 8,
  },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.onPrimary },
  wordmark: { ...typography.display, color: colors.text },

  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl },

  alert: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  alertNeutral: { backgroundColor: colors.surfaceSunken },
  alertNeutralText: { ...typography.body, color: colors.textMuted },
  alertDanger: { backgroundColor: colors.dangerSoft },
  alertDangerText: { ...typography.body, color: colors.onDangerSoft },

  field: { marginBottom: spacing.lg },
  label: { ...typography.caps, color: colors.textFaint, marginBottom: spacing.sm },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },

  submit: { marginTop: spacing.sm },
});
