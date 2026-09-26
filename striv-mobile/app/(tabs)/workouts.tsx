/**
 * Workout history.
 *
 * The list endpoint returns summaries (a count of exercises, not the exercises),
 * so opening one navigates to a detail screen that fetches the full session.
 *
 * A session still in progress (finished_at is null) is surfaced at the top with
 * a Resume action: leaving it buried in reverse-chronological order makes an
 * unfinished workout easy to forget, and the user has to remember it exists.
 */
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { workouts } from "../../src/api/endpoints";
import type { WorkoutSessionSummary } from "../../src/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from "../../src/components/ui";
import { colors, radius, spacing, typography } from "../../src/theme";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  return `${hours}h ${total % 60}m`;
}

export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const page = await workouts.list();
      setSessions(page.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workouts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inProgress = sessions.find((session) => !session.finished_at);
  const finished = sessions.filter((session) => session.finished_at);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Workouts</Text>
        <Text style={styles.subtitle}>{finished.length} completed</Text>
      </View>

      {loading ? (
        <LoadingState label="Loading workouts" />
      ) : error ? (
        <View style={styles.padded}>
          <ErrorState message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <FlatList
          data={finished}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: spacing.xxxl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            <>
              {/* Resume banner, so an open session cannot be lost track of. */}
              {inProgress ? (
                <Card style={styles.resumeCard}>
                  <View style={styles.resumeText}>
                    <Badge label="In progress" tone="warning" />
                    <Text style={styles.resumeTitle}>You have a workout open</Text>
                    <Text style={styles.resumeMeta}>Started {formatDate(inProgress.started_at)}</Text>
                  </View>
                  <Button
                    label="Resume"
                    onPress={() => router.push(`/workout/${inProgress.id}`)}
                    style={styles.resumeButton}
                  />
                </Card>
              ) : null}

              <Button
                label="Start a workout"
                onPress={() => router.push("/workout/new")}
                style={styles.startButton}
              />
            </>
          }
          ListEmptyComponent={
            <Card>
              <EmptyState
                title="No workouts yet"
                description="Start a workout to begin tracking your training."
              />
            </Card>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/workout/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Workout on ${formatDate(item.started_at)}`}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Card>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{formatDate(item.started_at)}</Text>
                    <Text style={styles.rowMeta}>
                      {item.workout_exercises_count} exercise
                      {item.workout_exercises_count === 1 ? "" : "s"} ·{" "}
                      {formatDuration(item.duration_minutes)}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.lg },
  header: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },

  list: { paddingHorizontal: spacing.lg, gap: spacing.md },

  resumeCard: {
    borderColor: colors.warning,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resumeText: { flex: 1, gap: spacing.xs },
  resumeTitle: { ...typography.bodyStrong, color: colors.text },
  resumeMeta: { ...typography.caption, color: colors.textMuted },
  resumeButton: { paddingHorizontal: spacing.lg },

  startButton: { marginBottom: spacing.lg },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.textFaint, lineHeight: 28 },
  pressed: { opacity: 0.7 },
});
