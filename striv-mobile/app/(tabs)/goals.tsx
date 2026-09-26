/**
 * Goals list.
 *
 * Progress comes embedded in the list response, so this screen makes one
 * request rather than one per goal â€” the same N+1 the web app had before it was
 * fixed there.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { goals as goalsApi } from "../../src/api/endpoints";
import type { Goal } from "../../src/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from "../../src/components/ui";
import { colors, radius, spacing, typography } from "../../src/theme";

const FILTERS = ["active", "completed", "all"] as const;
type Filter = (typeof FILTERS)[number];

function formatValue(value: number | null | undefined): string {
  if (value == null) return "â€”";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("active");
  const [items, setItems] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (status: Filter, isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const page = await goalsApi.list(status);
        setItems(page.data ?? []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load your goals.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

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
            void load(filter, true);
          }}
          tintColor={colors.text}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Goals</Text>
          <Text style={styles.subtitle}>Progress measured from where you started.</Text>
        </View>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((option) => {
          const active = filter === option;
          return (
            <Text
              key={option}
              onPress={() => setFilter(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              suppressHighlighting
              style={[styles.filter, active && styles.filterActive]}
            >
              {option === "all" ? "All" : option === "active" ? "Active" : "Completed"}
            </Text>
          );
        })}
      </View>

      {loading ? (
        <LoadingState label="Loading goals" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load(filter)} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === "all" ? "No goals yet" : `No ${filter} goals`}
            description="Set a target and Striv will track your progress towards it."
          />
        </Card>
      ) : (
        <View style={styles.list}>
          {items.map((goal) => {
            const pct = Math.max(0, Math.min(100, goal.progress_percentage ?? 0));
            const isWorkouts = goal.target_type === "workouts";
            const unit = isWorkouts ? "" : ` ${goal.unit}`;
            const repSuffix = goal.target_reps ? ` Ã— ${goal.target_reps}` : "";

            return (
              <Card key={goal.id}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.goalName} numberOfLines={1}>
                      {goal.exercise?.name ?? "All workouts"}
                    </Text>
                    <Text style={styles.goalType}>
                      {goalTypeLabel(goal.target_type)}
                      {repSuffix}
                    </Text>
                  </View>
                  <Badge
                    label={
                      goal.status === "completed"
                        ? "Completed"
                        : goal.status === "abandoned"
                          ? "Abandoned"
                          : `${Math.round(pct)}%`
                    }
                    tone={goal.status === "completed" ? "success" : goal.status === "abandoned" ? "neutral" : "accent"}
                  />
                </View>

                <Text style={styles.journey}>
                  {formatValue(goal.starting_value)}
                  {unit} â†’ <Text style={styles.journeyTarget}>{formatValue(goal.target_value)}{unit}</Text>
                </Text>

                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
                >
                  <View
                    style={[
                      styles.fill,
                      { width: `${pct}%` },
                      goal.status === "completed" && styles.fillComplete,
                    ]}
                  />
                </View>

                <Text style={styles.meta}>
                  Now {formatValue(goal.current_value)}
                  {unit}
                  {goal.remaining > 0 ? ` Â· ${formatValue(goal.remaining)}${unit} to go` : ""}
                </Text>
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function goalTypeLabel(targetType: string): string {
  switch (targetType) {
    case "weight":
      return "Weight target";
    case "one_rm":
      return "Estimated 1RM";
    case "reps":
      return "Rep target";
    case "workouts":
      return "Workout count";
    default:
      return targetType;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },

  filters: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  filter: {
    ...typography.label,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outline,
    overflow: "hidden",
  },
  filterActive: {
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    borderColor: colors.primary,
  },

  list: { gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  cardHeaderText: { flex: 1 },
  goalName: { ...typography.bodyStrong, color: colors.text },
  goalType: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  journey: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
  journeyTarget: { color: colors.text, fontWeight: "700" },

  track: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  fill: { height: "100%", borderRadius: radius.full, backgroundColor: colors.accent },
  fillComplete: { backgroundColor: colors.success },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
