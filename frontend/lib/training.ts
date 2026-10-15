/**
 * Types for the personal-trainer system.
 *
 * Mirrors the shapes returned by TrainingService on the backend. Kept in one
 * file so both the member and trainer screens agree on what an "overview" or a
 * "client" is, and so a backend field rename surfaces as a type error rather
 * than an undefined at runtime.
 */

export type MemberState =
  | "unmatched"
  | "await_schedule"
  | "active"
  | "completed"
  | "rejected";

export type GoalType = "muscle" | "strength" | "endurance";

export interface TrainingRequestSummary {
  id: number;
  status: string;
  goal_type: string | null;
  notes: string | null;
  created_at: string | null;
  matched_at: string | null;
}

export interface TrainerSummary {
  id: number;
  name: string;
  specialization: string | null;
  bio: string | null;
  rating: number | null;
}

export interface AssignmentSummary {
  id: number;
  status: string;
  confirmed: boolean;
  confirmed_at: string | null;
  started_at: string | null;
  assigned_by: string;
}

export interface ScheduleSlot {
  id: number;
  day_of_week: number;
  day_name: string;
  time_slot: string | null;
  focus: string | null;
  notes: string | null;
  proposed_by: string;
  confirmed_at: string | null;
  member_response: string | null;
  awaiting_member: boolean;
}

export interface ProgramExercise {
  id: number;
  exercise_id: number;
  name: string | null;
  order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
}

export interface Program {
  id: number;
  name: string;
  notes: string | null;
  est_duration_minutes: number | null;
  created_at: string | null;
  exercises: ProgramExercise[];
}

export interface TrainerFeedbackItem {
  id: number;
  kind: string;
  message: string;
  rating: number | null;
  trainer_name: string | null;
  workout_session_id: number | null;
  read_at: string | null;
  created_at: string | null;
}

/** GET /my-trainer */
export interface MemberOverview {
  request: TrainingRequestSummary | null;
  state: MemberState;
  trainer: TrainerSummary | null;
  assignment: AssignmentSummary | null;
  schedule: ScheduleSlot[];
  program: Program[];
  feedback: TrainerFeedbackItem[];
}

/** A row in the trainer's client list. */
export interface ClientRow {
  assignment_id: number;
  user_id: number;
  name: string | null;
  email: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  confirmed: boolean;
  started_at: string | null;
  schedule_days: number;
  workouts_30d: number;
  last_session_at: string | null;
  is_training_now: boolean;
}

export interface TrainerStats {
  clients: number;
  capacity: number;
  slots_free: number;
  awaiting_schedule: number;
  training_now: number;
}

export interface LiveSessionSummary {
  user_id: number;
  user_name: string | null;
  session_id: number;
  started_at: string | null;
  elapsed_minutes: number;
  sets_logged: number;
}

/** GET /trainer/dashboard */
export interface TrainerDashboard {
  trainer: {
    id: number;
    name: string;
    specialization: string | null;
    capacity: number;
    is_available: boolean;
    rating: number | null;
  };
  stats: TrainerStats;
  clients: ClientRow[];
  live: LiveSessionSummary[];
}

export interface ClientStats {
  workouts_total: number;
  workouts_30d: number;
  sets_total: number;
  volume_total_kg: number;
  last_session_at: string | null;
  goals_active: number;
  is_training_now: boolean;
}

export interface LiveSet {
  id: number;
  weight_kg: number | null;
  reps: number | null;
  completed_at: string | null;
}

export interface LiveExercise {
  id: number;
  name: string | null;
  sets: LiveSet[];
}

export interface LiveSessionDetail {
  id: number;
  started_at: string | null;
  elapsed_minutes: number;
  exercises: LiveExercise[];
  totals: { sets: number; exercises: number; volume_kg: number };
}

/** A set's photo evidence, as the trainer reviews it. */
export interface SetPhoto {
  id: number;
  verdict: string;
  /** True when no check could run — the photo is unproven, not confirmed. */
  unverified: boolean;
  analysis: string | null;
  confidence: number | null;
  trainer_note: string | null;
  reviewed: boolean;
  created_at: string | null;
  /** Served through an authorised route, never a public URL. */
  url: string;
}

export interface SessionHistoryItem {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  totals: { sets: number; exercises: number; volume_kg: number };
  exercises: {
    name: string | null;
    sets: {
      /** Absent on sets created before evidence was required. */
      id?: number;
      weight_kg: number | null;
      reps: number | null;
      /** Whether this set has accepted photo evidence. */
      proven?: boolean;
      photo?: SetPhoto | null;
    }[];
  }[];
}

/** GET /trainer/clients/{id} */
export interface ClientDetail {
  client: {
    id: number;
    name: string;
    email: string;
    profile: {
      age: number | null;
      location: string | null;
      weight_kg: number | null;
      height_cm: number | null;
      target_weight_kg: number | null;
      experience_level: string | null;
      primary_goal: string | null;
      training_frequency: number | null;
    } | null;
  };
  assignment: AssignmentSummary;
  schedule: ScheduleSlot[];
  program: Program[];
  stats: ClientStats;
  recent_sessions: SessionHistoryItem[];
  live_session: LiveSessionDetail | null;
  feedback: TrainerFeedbackItem[];
}

/** GET /notifications */
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read: boolean;
  created_at: string | null;
}

export interface NotificationList {
  notifications: NotificationItem[];
  unread_count: number;
}

/** Aim labels for the goal the member selects during onboarding. */
export const GOAL_LABELS: Record<GoalType, { label: string; desc: string; icon: string }> = {
  muscle: {
    label: "Build Muscle",
    desc: "Add size and shape. Your trainer programs volume and progressive load.",
    icon: "fitness_center",
  },
  strength: {
    label: "Get Stronger",
    desc: "Move heavier weight. Your trainer programs the big lifts in blocks.",
    icon: "trending_up",
  },
  endurance: {
    label: "Conditioning",
    desc: "Last longer and recover faster. Your trainer builds work capacity.",
    icon: "directions_run",
  },
};

export const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};
