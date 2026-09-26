/**
 * API response types.
 *
 * Hand-written rather than generated: the surface is small, and an explicit
 * type per endpoint documents what the app actually relies on. Anything the
 * backend returns but the app does not use is deliberately omitted, so a
 * backend change that removes it does not break the build for no reason.
 */

export type DashboardStats = {
  /** Total kg lifted in the last 30 days. */
  volume_last_30d: number | null;
  /** Same window, the 30 days before it — used for the trend percentage. */
  volume_prev_30d: number | null;
  sets_last_30d: number | null;
  workouts_last_30d: number | null;
  /** Signed percentage change; null when there is no prior period to compare. */
  strength_trend_pct: number | null;
  /** Note the key is `volume`, not `volume_kg`. */
  weekly_volume: Array<{ week_start: string; volume: number | null }>;
  /**
   * Recent personal records.
   *
   * These are raw rows: they carry `exercise_id` and a `pr_type`, but no
   * exercise name, so a screen showing a name has to join it against the
   * exercise list itself.
   */
  recent_prs: Array<{
    id: number;
    exercise_id: number;
    pr_type: string;
    value: number;
    achieved_at: string | null;
  }>;
};

export type Goal = {
  id: number;
  exercise_id: number | null;
  exercise: { id: number; name: string; slug: string } | null;
  target_type: "weight" | "one_rm" | "reps" | "workouts";
  target_value: number;
  /** Frozen at creation: progress is measured from here, not from zero. */
  starting_value: number;
  target_reps: number | null;
  deadline: string | null;
  completed_at: string | null;
  status: "active" | "completed" | "abandoned";
  unit: string;
  current_value: number;
  progress_percentage: number;
  required_delta: number;
  remaining: number;
};

export type Exercise = {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  equipment: string | null;
  primary_muscles: string[] | null;
};

export type WorkoutSet = {
  id: number;
  workout_exercise_id?: number;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type WorkoutExercise = {
  id: number;
  workout_session_id?: number;
  exercise_id: number;
  order: number;
  notes: string | null;
  exercise: Exercise;
  sets: WorkoutSet[];
};

/**
 * A session as returned by the list endpoint.
 *
 * The list is a summary — it carries `workout_exercises_count` instead of the
 * exercises themselves, so opening a session needs a second request for the
 * detail. Modelled explicitly rather than reusing WorkoutSession so the two
 * shapes cannot be confused at a call site.
 */
export type WorkoutSessionSummary = {
  id: number;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  workout_exercises_count: number;
};

export type WorkoutSession = {
  id: number;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  workout_exercises?: WorkoutExercise[];
};

export type ChatSession = {
  id: number;
  title: string | null;
  last_message_at: string | null;
  created_at?: string;
  messages_count?: number;
};

export type ChatMessage = {
  id: number;
  session_id?: number;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  image_path?: string | null;
  created_at: string;
};

export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type PersonalRecord = {
  id: number;
  exercise_id: number;
  pr_type: string;
  value: number;
  achieved_at: string;
  exercise: { id: number; name: string; slug: string } | null;
};

export type Profile = {
  age: number | null;
  location: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  experience_level: string | null;
  primary_goal: string | null;
  training_frequency: number | null;
  onboarding_completed_at: string | null;
  preferences: Record<string, unknown> | null;
};
