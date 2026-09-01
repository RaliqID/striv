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
