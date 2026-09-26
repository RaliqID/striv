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
  Profile,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSessionSummary,
  WorkoutSet,
} from "./types";

/* ---------------------------------------------------------------- analytics */

export type ProgressResponse = {
  e1rm_series: Array<{ date: string; e1rm: number; exercise_name?: string }>;
  volume_series: Array<{ week_start: string; volume_kg: number }>;
  workout_dates?: string[];
};

export const analytics = {
  dashboard: () => api.get<DashboardStats>("/analytics/dashboard"),
  progress: () => api.get<ProgressResponse>("/analytics/progress"),
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
  list: () => api.get<Paginated<WorkoutSessionSummary>>("/workout-sessions"),

  start: (payload?: { routine_id?: number; notes?: string }) =>
    api.post<WorkoutSession>("/workout-sessions", payload ?? {}),

  detail: (id: number) => api.get<WorkoutSession>(`/workout-sessions/${id}`),

  addExercise: (sessionId: number, exerciseId: number) =>
    api.post<WorkoutExercise>(`/workout-sessions/${sessionId}/exercises`, {
      exercise_id: exerciseId,
    }),

  addSet: (
    sessionId: number,
    workoutExerciseId: number,
    payload: { weight_kg: number | null; reps: number | null; rpe?: number | null }
  ) =>
    api.post<WorkoutSet>(
      `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets`,
      payload
    ),

  updateSet: (
    sessionId: number,
    workoutExerciseId: number,
    setId: number,
    payload: { weight_kg?: number | null; reps?: number | null; rpe?: number | null }
  ) =>
    api.put<WorkoutSet>(
      `/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`,
      payload
    ),

  deleteSet: (sessionId: number, workoutExerciseId: number, setId: number) =>
    api.delete<void>(`/workout-sessions/${sessionId}/exercises/${workoutExerciseId}/sets/${setId}`),

  removeExercise: (sessionId: number, workoutExerciseId: number) =>
    api.delete<void>(`/workout-sessions/${sessionId}/exercises/${workoutExerciseId}`),

  finish: (sessionId: number, notes?: string) =>
    api.post<WorkoutSession>(`/workout-sessions/${sessionId}/finish`, { notes }),

  remove: (sessionId: number) => api.delete<void>(`/workout-sessions/${sessionId}`),
};

/* ----------------------------------------------------------------- records */

export const records = {
  list: () => api.get<Paginated<PersonalRecord>>("/records"),
};

/* -------------------------------------------------------------------- chat */

type ChatSessionsResponse = { sessions: ChatSession[] };
type ChatHistoryResponse = { session: ChatSession; messages: ChatMessage[] };

/**
 * Both sides of an exchange come back from /chat.
 *
 * The field is `content`, not `message` — the validation error names it, and
 * guessing costs a round trip. The assistant reply is returned inline rather
 * than requiring a follow-up history fetch, so the UI can append it directly.
 */
export type ChatSendResponse = {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  session: ChatSession;
};

export const chat = {
  sessions: () => api.get<ChatSessionsResponse>("/chat/sessions"),
  history: (sessionId: number) => api.get<ChatHistoryResponse>(`/chat/sessions/${sessionId}`),
  send: (content: string, sessionId?: number) =>
    api.post<ChatSendResponse>("/chat", {
      content,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  remove: (sessionId: number) => api.delete<void>(`/chat/sessions/${sessionId}`),
};

/* ----------------------------------------------------------------- profile */

export const profile = {
  show: () => api.get<{ user: unknown; profile: Profile | null }>("/profile"),
  update: (payload: Record<string, unknown>) => api.put<unknown>("/profile", payload),
};
