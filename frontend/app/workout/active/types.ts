export interface WorkoutSet {
  id: number;
  workout_exercise_id: number;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface WorkoutExercise {
  id: number;
  workout_session_id: number;
  exercise_id: number;
  order: number | null;
  notes: string | null;
  exercise: {
    id: number;
    name: string;
    slug: string;
    category: string | null;
    equipment: string | null;
  } | null;
  sets: WorkoutSet[] | null;
}

export interface SessionSummary {
  exercises: number;
  sets: number;
  volume_kg: number;
}

export interface FinishResponse {
  session: {
    id: number;
    user_id: number;
    started_at: string;
    finished_at: string | null;
    duration_minutes: number | null;
    notes: string | null;
  };
  summary: SessionSummary;
  /**
   * The reward payload, present once the server has computed it.
   *
   * Nullable because the AI sentence inside can fail while the rest still
   * succeeds — the finish call must never fail because a reward could not be
   * built.
   */
  reward: import("@/components/workout/WorkoutReward").Reward | null;
  /**
   * XP awarded for this session, plus the level state AFTER the awards.
   *
   * Optional because an older backend may omit it; the reward screen then
   * simply does not show the XP block, rather than failing to finish.
   */
  xp?: import("@/lib/progression").SessionXp | null;
  /** Badges that crossed their threshold on this session. */
  achievements_unlocked?: import("@/lib/progression").UnlockedBadge[] | null;
}

/** Local UI model for a set row (editable strings + local completed flag). */
export interface UiSet {
  id: number;
  setNumber: number;
  kg: string;
  reps: string;
  saved: boolean;
}

export interface UiExercise {
  id: number;
  exerciseId: number;
  name: string;
  sets: UiSet[];
}
