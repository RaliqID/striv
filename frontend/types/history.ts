export interface WorkoutSession {
  id: number;
  user_id: number;
  started_at: string;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  workout_exercises_count: number;
  created_at: string;
  updated_at: string;
}
