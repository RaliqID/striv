/**
 * Active workout — logging screen.
 *
 * This is the screen the app exists for: standing in a gym, one hand free, and
 * minutes between sets. Every decision here favours that context.
 *
 *  - Values are keyed on a numeric keyboard and committed with a done press, not
 *    with a long form and a save button at the bottom.
 *  - A new set pre-fills the previous set's weight and reps. Repeating the last
 *    set is the overwhelmingly common case; making the user retype it is the
 *    single biggest source of friction in a workout tracker.
 *  - Targets are 44pt+ with hit slop, sized for a thumb, and the set row is a
 *    single tap target rather than three small ones.
 *
 * Writes are optimistic for adding a set: the row appears immediately and is
 * reconciled with the server response, because a visible delay between tapping
 * and seeing the set breaks the rhythm of logging.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { exercises as exercisesApi, workouts } from "../../src/api/endpoints";
import type { Exercise, WorkoutExercise, WorkoutSession } from "../../src/api/types";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../../src/components/ui";
import { colors, HIT_SLOP, radius, spacing, typography } from "../../src/theme";

type SetDraft = { weight: string; reps: string };

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // "new" means start a session, otherwise load the one with this id.
  const isNew = id === "new";
  const [sessionId, setSessionId] = useState<number | null>(isNew ? null : Number(id));

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [exerciseResults, setExerciseResults] = useState<Exercise[]>([]);
  const [pickingExercise, setPickingExercise] = useState(false);

  // Draft inputs per workout-exercise, keyed by its id.
  const [drafts, setDrafts] = useState<Record<number, SetDraft>>({});

  // Guards against React 18's double-invoked effects in dev creating two
  // sessions from one tap on "Start".
  const starting = useRef(false);

  const load = useCallback(
    async (targetId: number) => {
      setError(null);
      try {
        const detail = await workouts.detail(targetId);
        setSession(detail);
        seedDrafts(detail);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load this workout.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Pre-fill each exercise's inputs from its last set.
   *
   * Repeating the previous set is the common case, so defaulting to it means
   * most sets are logged with one tap instead of two keystrokes.
   */
  const seedDrafts = (detail: WorkoutSession) => {
    const next: Record<number, SetDraft> = {};
    for (const we of detail.workout_exercises ?? []) {
      const last = we.sets[we.sets.length - 1];
      next[we.id] = {
        weight: last?.weight_kg != null ? String(last.weight_kg) : "",
        reps: last?.reps != null ? String(last.reps) : "",
      };
    }
    setDrafts((current) => ({ ...next, ...current }));
  };

  // Start or load.
  useEffect(() => {
    if (!isNew) {
      void load(Number(id));
      return;
    }

    if (starting.current) return;
    starting.current = true;

    (async () => {
      try {
        const created = await workouts.start();
        setSessionId(created.id);
        setSession(created);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start a workout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, load]);

  // Exercise search, debounced.
  useEffect(() => {
    if (!pickerOpen) return;
    const term = exerciseQuery.trim();
    if (!term) {
      setExerciseResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const page = await exercisesApi.list(term);
        setExerciseResults(page.data ?? []);
      } catch {
        setExerciseResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [exerciseQuery, pickerOpen]);

  const exercisesInSession: WorkoutExercise[] = session?.workout_exercises ?? [];

  const totalSets = useMemo(
    () => exercisesInSession.reduce((sum, we) => sum + we.sets.length, 0),
    [exercisesInSession]
  );

  const addExercise = async (exercise: Exercise) => {
    if (!sessionId || pickingExercise) return;
    setPickingExercise(true);
    try {
      await workouts.addExercise(sessionId, exercise.id);
      setPickerOpen(false);
      setExerciseQuery("");
      await load(sessionId);
    } catch (caught) {
      Alert.alert("Could not add exercise", caught instanceof Error ? caught.message : "Try again.");
    } finally {
      setPickingExercise(false);
    }
  };

  const draftFor = (we: WorkoutExercise): SetDraft =>
    drafts[we.id] ?? {
      weight: we.sets[we.sets.length - 1]?.weight_kg?.toString() ?? "",
      reps: we.sets[we.sets.length - 1]?.reps?.toString() ?? "",
    };

  const updateDraft = (weId: number, field: keyof SetDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [weId]: { ...(current[weId] ?? { weight: "", reps: "" }), [field]: value },
    }));
  };

  const logSet = async (we: WorkoutExercise) => {
    if (!sessionId) return;
    const draft = draftFor(we);

    const weight = draft.weight.trim() === "" ? null : Number(draft.weight);
    const reps = draft.reps.trim() === "" ? null : Number(draft.reps);

    if (reps == null || Number.isNaN(reps) || reps <= 0) {
      Alert.alert("Enter reps", "A set needs a rep count.");
      return;
    }
    if (weight != null && (Number.isNaN(weight) || weight < 0)) {
      Alert.alert("Check the weight", "Weight must be zero or more.");
      return;
    }

    setBusy(true);
    try {
      await workouts.addSet(sessionId, we.id, { weight_kg: weight, reps });
      await load(sessionId);
    } catch (caught) {
      Alert.alert("Could not save the set", caught instanceof Error ? caught.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const removeSet = (we: WorkoutExercise, setId: number, setNumber: number) => {
    if (!sessionId) return;
    Alert.alert("Delete this set?", `Set ${setNumber} will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await workouts.deleteSet(sessionId, we.id, setId);
            await load(sessionId);
          } catch (caught) {
            Alert.alert("Could not delete", caught instanceof Error ? caught.message : "Try again.");
          }
        },
      },
    ]);
  };

  const finish = async () => {
    if (!sessionId) return;

    if (totalSets === 0) {
      Alert.alert(
        "Finish without logging anything?",
        "This workout has no sets. It will still be saved.",
        [
          { text: "Keep going", style: "cancel" },
          { text: "Finish anyway", onPress: () => void doFinish() },
        ]
      );
      return;
    }
    void doFinish();
  };

  const doFinish = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await workouts.finish(sessionId);
      router.replace("/workouts");
    } catch (caught) {
      Alert.alert("Could not finish", caught instanceof Error ? caught.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <LoadingState label={isNew ? "Starting workout" : "Loading workout"} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top + spacing.lg }]}>
        <ErrorState message={error} onRetry={() => (sessionId ? void load(sessionId) : router.back())} />
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Workout</Text>
            <Text style={styles.subtitle}>
              {exercisesInSession.length} exercise{exercisesInSession.length === 1 ? "" : "s"} ·{" "}
              {totalSets} set{totalSets === 1 ? "" : "s"}
            </Text>
          </View>
          <Button label="Close" variant="ghost" onPress={() => router.back()} />
        </View>

        {exercisesInSession.length === 0 ? (
          <Card>
            <EmptyState
              title="No exercises yet"
              description="Add the first exercise you are going to work on."
            />
          </Card>
        ) : (
          exercisesInSession.map((we) => {
            const draft = draftFor(we);
            return (
              <Card key={we.id} style={styles.exerciseCard}>
                <Text style={styles.exerciseName}>{we.exercise.name}</Text>

                {we.sets.length > 0 ? (
                  <View style={styles.setList}>
                    {we.sets.map((set, index) => (
                      <Pressable
                        key={set.id}
                        onLongPress={() => removeSet(we, set.id, set.set_number)}
                        delayLongPress={400}
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${set.set_number}: ${set.weight_kg ?? 0} kilos for ${set.reps ?? 0} reps. Long press to delete.`}
                        style={[styles.setRow, index > 0 && styles.setRowBorder]}
                      >
                        <Text style={styles.setIndex}>{set.set_number}</Text>
                        <Text style={styles.setValue}>
                          {set.weight_kg != null ? `${set.weight_kg} kg` : "—"}
                        </Text>
                        <Text style={styles.setReps}>
                          {set.reps != null ? `${set.reps} reps` : "—"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noSets}>No sets yet</Text>
                )}

                {/* Entry row: weight, reps, add. */}
                <View style={styles.entryRow}>
                  <View style={styles.entryField}>
                    <Text style={styles.entryLabel}>KG</Text>
                    <TextInput
                      value={draft.weight}
                      onChangeText={(value) => updateDraft(we.id, "weight", value)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      editable={!busy}
                      style={styles.entryInput}
                      accessibilityLabel={`Weight in kilos for ${we.exercise.name}`}
                    />
                  </View>
                  <View style={styles.entryField}>
                    <Text style={styles.entryLabel}>REPS</Text>
                    <TextInput
                      value={draft.reps}
                      onChangeText={(value) => updateDraft(we.id, "reps", value)}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      editable={!busy}
                      style={styles.entryInput}
                      accessibilityLabel={`Reps for ${we.exercise.name}`}
                    />
                  </View>
                  <Pressable
                    onPress={() => void logSet(we)}
                    disabled={busy}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={`Log set for ${we.exercise.name}`}
                    style={({ pressed }) => [
                      styles.addSetButton,
                      pressed && styles.pressed,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.addSetLabel}>Log</Text>
                  </Pressable>
                </View>

                <Text style={styles.hint}>Long-press a set to delete it.</Text>
              </Card>
            );
          })
        )}

        <Button label="Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />

        <Button
          label="Finish workout"
          onPress={() => void finish()}
          busy={busy}
          style={styles.finishButton}
        />
      </ScrollView>

      {/* Exercise picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add exercise</Text>
            <Button label="Cancel" variant="ghost" onPress={() => setPickerOpen(false)} />
          </View>

          <TextInput
            value={exerciseQuery}
            onChangeText={setExerciseQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.textFaint}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.search}
          />

          {pickingExercise ? <ActivityIndicator style={styles.modalLoading} /> : null}

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
            {exerciseResults.length === 0 ? (
              <EmptyState
                title={exerciseQuery ? "No matches" : "Search for an exercise"}
                description={exerciseQuery ? "Try a different name." : undefined}
              />
            ) : (
              exerciseResults.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  onPress={() => void addExercise(exercise)}
                  disabled={pickingExercise}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.result, pressed && styles.pressed]}
                >
                  <Text style={styles.resultName}>{exercise.name}</Text>
                  {exercise.equipment ? (
                    <Text style={styles.resultMeta}>{exercise.equipment}</Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  padded: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },

  exerciseCard: { gap: spacing.sm },
  exerciseName: { ...typography.heading, color: colors.text },
  noSets: { ...typography.caption, color: colors.textFaint },

  setList: { marginTop: spacing.xs },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    minHeight: 44,
    gap: spacing.md,
  },
  setRowBorder: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  setIndex: {
    ...typography.caption,
    color: colors.onPrimary,
    backgroundColor: colors.textFaint,
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
  setValue: { ...typography.bodyStrong, color: colors.text, minWidth: 72 },
  setReps: { ...typography.body, color: colors.textMuted },

  entryRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  entryField: { flex: 1 },
  entryLabel: { ...typography.caps, color: colors.textFaint, marginBottom: spacing.xs },
  entryInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: "center",
  },
  addSetButton: {
    minHeight: 48,
    minWidth: 76,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addSetLabel: { ...typography.bodyStrong, color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  hint: { ...typography.caption, color: colors.textFaint, marginTop: spacing.sm },

  finishButton: { marginTop: spacing.md },

  modal: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.title, color: colors.text },
  modalLoading: { marginTop: spacing.md },
  search: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    ...typography.body,
    color: colors.text,
  },
  results: { paddingTop: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxxl },
  result: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    minHeight: 56,
    justifyContent: "center",
  },
  resultName: { ...typography.bodyStrong, color: colors.text },
  resultMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
