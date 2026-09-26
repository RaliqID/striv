/**
 * Profile.
 *
 * Read-only for now: the fields shown come from the onboarding questionnaire, and
 * editing them is a separate flow rather than an inline form, because a form
 * here would need validation and optimistic updates for little benefit.
 *
 * Shows a fallback for every value. A member who skipped onboarding has null for
 * most of these, and a blank row reads as a bug rather than as "not provided".
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { profile as profileApi, records } from "../../src/api/endpoints";
import type { PersonalRecord, Profile as ProfileType } from "../../src/api/types";
import { Badge, Button, Card, SectionTitle } from "../../src/components/ui";
import { useAuth } from "../../src/hooks/useAuth";
import { colors, radius, spacing, typography } from "../../src/theme";

type Row = { label: string; value: string };

function display(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "Not set";
  return `${value}${suffix}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [bests, setBests] = useState<PersonalRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Two independent reads, issued together.
      const [profileResponse, recordPage] = await Promise.all([
        profileApi.show(),
        records.list(),
      ]);
      setProfile(profileResponse.profile ?? null);
      // Highest value first: the records endpoint does not guarantee ordering,
      // and a "best lifts" list that is not sorted is misleading.
      setBests([...(recordPage.data ?? [])].sort((a, b) => b.value - a.value).slice(0, 5));
    } catch {
      // Leaving the previous values in place beats blanking the screen on a
      // transient network failure.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const aboutRows: Row[] = [
    { label: "Experience", value: display(profile?.experience_level) },
    { label: "Primary goal", value: display(profile?.primary_goal) },
    { label: "Frequency", value: profile?.training_frequency ? `${profile.training_frequency}× / week` : "Not set" },
    { label: "Location", value: display(profile?.location) },
  ];

  const bodyRows: Row[] = [
    { label: "Weight", value: display(profile?.weight_kg, " kg") },
    { label: "Target weight", value: display(profile?.target_weight_kg, " kg") },
    { label: "Height", value: display(profile?.height_cm, " cm") },
    { label: "Age", value: display(profile?.age) },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.text}
        />
      }
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? "Unknown"}</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        <View style={styles.badges}>
          {user?.is_admin ? <Badge label="Administrator" tone="accent" /> : null}
          <Badge label={profile?.onboarding_completed_at ? "Onboarded" : "Setup incomplete"} tone={profile?.onboarding_completed_at ? "success" : "warning"} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Training</SectionTitle>
        <Card>
          {aboutRows.map((row, index) => (
            <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Body</SectionTitle>
        <Card>
          {bodyRows.map((row, index) => (
            <View key={row.label} style={[styles.row, index > 0 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </Card>
      </View>

      {bests.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>Best lifts</SectionTitle>
          <Card>
            {bests.map((record, index) => (
              <View key={record.id ?? `${record.exercise_id}-${index}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                <View style={styles.rowLabelGroup}>
                  <Text style={styles.rowLabel}>{record.exercise?.name ?? "Unknown exercise"}</Text>
                  <Text style={styles.rowSub}>{record.pr_type}</Text>
                </View>
                <Text style={styles.rowValue}>{Math.round(record.value)} kg</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  identity: { alignItems: "center", gap: spacing.xs },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  avatarText: { ...typography.display, color: colors.onPrimary },
  name: { ...typography.title, color: colors.text },
  email: { ...typography.body, color: colors.textMuted },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },

  section: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 44,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  rowLabelGroup: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.textMuted, flex: 1 },
  rowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  rowValue: { ...typography.bodyStrong, color: colors.text, textAlign: "right" },
});
