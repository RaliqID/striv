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
  weekly_volume: Array<{ week_start: string; volume_kg: number | null }>;
  recent_prs: Array<{
    exercise_name: string;
    exercise_slug: string;
    weight_kg: number | null;
    reps: number | null;
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
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type WorkoutExercise = {
  id: number;
  exercise_id: number;
  exercise: Exercise;
  order: number;
  notes: string | null;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  id: number;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  exercises?: WorkoutExercise[];
};

export type ChatSession = {
  id: number;
  title: string | null;
  last_message_at: string | null;
  messages_count?: number;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
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
  exercise_name: string;
  exercise_slug: string;
  weight_kg: number | null;
  reps: number | null;
  estimated_1rm: number | null;
  achieved_at: string | null;
};
