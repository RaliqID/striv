export interface RoutineExercise {
  id: number;
  order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  exercise: {
    id: number;
    name: string;
    slug: string;
    category: string | null;
    equipment: string | null;
  } | null;
}

export interface Routine {
  id: number;
  name: string;
  notes: string | null;
  est_duration_minutes: number | null;
  routine_exercises?: RoutineExercise[];
  routine_exercises_count?: number;
}
