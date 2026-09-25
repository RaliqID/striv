/**
 * Dashboard — the app's home screen.
 *
 * Reads /analytics/dashboard and /goals in parallel rather than sequentially:
 * two independent requests, so issuing them together halves the wait.
 *
 * Every metric tolerates a null. The backend returns null for a user with no
 * history (a new account has no previous 30-day window to compare against), and
 * rendering "NaN%" or "0%" there would be a lie — "—" is the honest display.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { analytics, goals as goalsApi } from "../src/api/endpoints";
import type { DashboardStats, Goal } from "../src/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, SectionTitle } from "../src/components/ui";
import { useAuth } from "../src/hooks/useAuth";
import { colors, radius, spacing, typography } from "../src/theme";

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatVolume(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k kg`;
  return `${Math.round(value)} kg`;
}

function formatTrend(value: number | null | undefined): { text: string; tone: "success" | "danger" | "neutral" } {
  if (value == null) return { text: "No prior data", tone: "neutral" };
  const rounded = Math.round(value);
  if (rounded > 0) return { text: `+${rounded}%`, tone: "success" };
  if (rounded < 0) return { text: `${rounded}%`, tone: "danger" };
  return { text: "No change", tone: "neutral" };
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    try {
      // Two independent calls, issued together.
      const [dashboard, goalPage] = await Promise.all([
        analytics.dashboard(),
        goalsApi.list("active"),
      ]);
      setStats(dashboard);
      setActiveGoals((goalPage.data ?? []).slice(0, 3));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const trend = formatTrend(stats?.strength_trend_pct);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>
            {greeting}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </Text>
          <Text style={styles.title}>Overview</Text>
        </View>
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>

      {loading ? (
        <LoadingState label="Loading your training" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          <View style={styles.metricsGrid}>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>WORKOUTS</Text>
              <Text style={styles.metricValue}>{formatNumber(stats?.workouts_last_30d)}</Text>
              <Text style={styles.metricMeta}>Last 30 days</Text>
            </Card>
            <Card style={styles.metric}>
              <Text style={styles.metricLabel}>SETS</Text>
              <Text style={styles.metricValue}>{formatNumber(stats?.sets_last_30d)}</Text>
              <Text style={styles.metricMeta}>Last 30 days</Text>
            </Card>
          </View>

          <Card style={styles.wideCard}>
            <Text style={styles.metricLabel}>VOLUME</Text>
            <Text style={styles.metricValueLarge}>{formatVolume(stats?.volume_last_30d)}</Text>
            <View style={styles.trendRow}>
              <Badge label={trend.text} tone={trend.tone} />
              <Text style={styles.metricMeta}>
                vs {formatVolume(stats?.volume_prev_30d)} previous
              </Text>
            </View>
          </Card>

          <View style={styles.section}>
            <SectionTitle>Active goals</SectionTitle>
            {activeGoals.length === 0 ? (
              <Card>
                <EmptyState
                  title="No active goals"
                  description="Set a target and Striv will measure your progress from where you started."
                  action={<Button label="Go to goals" variant="secondary" onPress={() => router.push("/goals")} />}
                />
              </Card>
            ) : (
              <View style={styles.goalList}>
                {activeGoals.map((goal) => {
                  const pct = Math.max(0, Math.min(100, goal.progress_percentage ?? 0));
                  const unit = goal.target_type === "workouts" ? "" : ` ${goal.unit}`;
                  return (
                    <Card key={goal.id}>
                      <View style={styles.goalHeader}>
                        <Text style={styles.goalName} numberOfLines={1}>
                          {goal.exercise?.name ?? "All workouts"}
                        </Text>
                        <Text style={styles.goalPct}>{Math.round(pct)}%</Text>
                      </View>

                      {/* The journey, not just a ratio: where you started and
                          where you are aiming, so the bar has meaning. */}
                      <Text style={styles.goalJourney}>
                        {formatNumber(goal.starting_value)}
                        {unit} → <Text style={styles.goalTarget}>{formatNumber(goal.target_value)}{unit}</Text>
                      </Text>

                      <View
                        style={styles.progressTrack}
                        accessibilityRole="progressbar"
                        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
                      >
                        <View style={[styles.progressFill, { width: `${pct}%` }]} />
                      </View>

                      <Text style={styles.goalMeta}>
                        Now {formatNumber(goal.current_value)}
                        {unit}
                        {goal.remaining > 0 ? ` · ${formatNumber(goal.remaining)}${unit} to go` : ""}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <SectionTitle>Recent records</SectionTitle>
            <Card>
              {stats?.recent_prs?.length ? (
                stats.recent_prs.slice(0, 5).map((pr, index) => (
                  <View
                    key={`${pr.exercise_slug}-${pr.achieved_at}-${index}`}
                    style={[styles.prRow, index > 0 && styles.prRowBorder]}
                  >
                    <Text style={styles.prName} numberOfLines={1}>
                      {pr.exercise_name}
                    </Text>
                    <Text style={styles.prValue}>
                      {formatNumber(pr.weight_kg)} kg
                      {pr.reps ? ` × ${pr.reps}` : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyState title="No records yet" description="Log a workout to start setting personal bests." />
              )}
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  greeting: { ...typography.body, color: colors.textMuted },
  title: { ...typography.title, color: colors.text, marginTop: 2 },

  metricsGrid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  metric: { flex: 1 },
  metricLabel: { ...typography.caps, color: colors.textFaint },
  metricValue: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  metricValueLarge: { ...typography.display, color: colors.text, marginTop: spacing.sm },
  metricMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  wideCard: { marginBottom: spacing.xl },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },

  section: { marginBottom: spacing.xl },
  goalList: { gap: spacing.md },

  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  goalName: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  goalPct: { ...typography.bodyStrong, color: colors.accent },
  goalJourney: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  goalTarget: { color: colors.text, fontWeight: "700" },

  progressTrack: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  progressFill: { height: "100%", borderRadius: radius.full, backgroundColor: colors.accent },
  goalMeta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },

  prRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  prRowBorder: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  prName: { ...typography.body, color: colors.text, flex: 1 },
  prValue: { ...typography.bodyStrong, color: colors.text },
});
