/**
 * Endpoint wrappers, grouped by domain.
 *
 * Screens call these rather than building paths inline, so a route change is a
 * one-line edit here instead of a search across the UI. Response types come from
 * ./types, which is where the contract with the backend is documented.
 */
import { api } from "./client";
import type {
  ChatMessage,
  ChatSession,
  DashboardStats,
  Exercise,
  Goal,
  Paginated,
  PersonalRecord,
  WorkoutSession,
} from "./types";

/* ---------------------------------------------------------------- analytics */

export const analytics = {
  dashboard: () => api.get<DashboardStats>("/analytics/dashboard"),
  progress: () => api.get<unknown>("/analytics/progress"),
};

/* ------------------------------------------------------------------- goals */

export const goals = {
  list: (status?: string) =>
    api.get<Paginated<Goal>>(`/goals${status && status !== "all" ? `?status=${status}` : ""}`),

  create: (payload: {
    target_type: string;
    target_value: number;
    exercise_id?: number;
    target_reps?: number | null;
    deadline?: string | null;
  }) => api.post<Goal>("/goals", payload),

  update: (id: number, payload: Record<string, unknown>) =>
    api.put<Goal>(`/goals/${id}`, payload),

  remove: (id: number) => api.delete<void>(`/goals/${id}`),

  /**
   * The user's current best for a proposed goal standard.
   * Used while filling the form so a target that is not an improvement is
   * caught before submitting.
   */
  baseline: (params: { target_type: string; exercise_id?: number; target_reps?: number }) => {
    const query = new URLSearchParams({ target_type: params.target_type });
    if (params.exercise_id) query.set("exercise_id", String(params.exercise_id));
    if (params.target_reps) query.set("target_reps", String(params.target_reps));
    return api.get<{ current_value: number; target_type: string }>(`/goals/baseline?${query}`);
  },
};

/* --------------------------------------------------------------- exercises */

export const exercises = {
  list: (search?: string) =>
    api.get<Paginated<Exercise>>(`/exercises${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  detail: (slug: string) => api.get<Exercise>(`/exercises/${slug}`),
};

/* ---------------------------------------------------------------- workouts */

export const workouts = {
  list: () => api.get<Paginated<WorkoutSession>>("/workout-sessions"),

  start: (payload?: { routine_id?: number; notes?: string }) =>
    api.post<WorkoutSession>("/workout-sessions", payload ?? {}),

  detail: (id: number) => api.get<WorkoutSession>(`/workout-sessions/${id}`),

  addExercise: (sessionId: number, exerciseId: number) =>
    api.post<unknown>(`/workout-sessions/${sessionId}/exercises`, { exercise_id: exerciseId }),

  addSet: (
    sessionId: number,
    workoutExerciseId: number,
    payload: { weight_kg: number | null; reps: number | null; rpe?: number | null }
  ) => api.post<unknown>(`/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets`, payload),

  updateSet: (
    sessionId: number,
    workoutExerciseId: number,
    setId: number,
    payload: { weight_kg?: number | null; reps?: number | null; rpe?: number | null }
  ) =>
    api.put<unknown>(
      `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`,
      payload
    ),

  deleteSet: (sessionId: number, workoutExerciseId: number, setId: number) =>
    api.delete<void>(`/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`),

  finish: (sessionId: number, notes?: string) =>
    api.post<WorkoutSession>(`/workout-sessions/${sessionId}/finish`, { notes }),
};

/* ----------------------------------------------------------------- records */

export const records = {
  list: () => api.get<Paginated<PersonalRecord>>("/records"),
};

/* -------------------------------------------------------------------- chat */

export const chat = {
  sessions: () => api.get<Paginated<ChatSession>>("/chat/sessions"),

  history: (sessionId: number) =>
    api.get<{ data: ChatMessage[] } | ChatMessage[]>(`/chat/sessions/${sessionId}`),

  send: (message: string, sessionId?: number) =>
    api.post<{ message: ChatMessage; session_id: number; title?: string }>("/chat", {
      message,
      session_id: sessionId,
    }),
};

/* ----------------------------------------------------------------- profile */

export const profile = {
  show: () => api.get<unknown>("/profile"),
  update: (payload: Record<string, unknown>) => api.put<unknown>("/profile", payload),
};
