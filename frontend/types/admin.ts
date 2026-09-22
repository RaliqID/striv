export type AdminStats = {
  total_users: number;
  new_users_7d: number;
  active_users_30d: number;
  suspended_users: number;
  total_workouts: number;
  workouts_30d: number;
  total_sets: number;
  volume_30d_kg: number;
  chat_messages_30d: number;
  ai_image_messages_30d: number;
  signups_series: Array<{ date: string; count: number }>;
  top_exercises: Array<{ name: string; uses: number }>;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  last_active_at: string | null;
  workouts_30d: number;
  chat_messages_30d: number;
};

export type AdminUsersResponse = {
  data: AdminUser[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};

export type AdminUserDetail = {
  user: AdminUser;
  profile: Record<string, unknown> | null;
  recent_workouts: Array<Record<string, unknown>>;
  stats: Record<string, unknown>;
  chat_sessions: Array<Record<string, unknown>>;
};