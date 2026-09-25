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
  must_change_password: boolean;
  created_at: string;
  last_active_at: string | null;
  workouts_30d: number;
  chat_messages_30d: number;
};

export type AdminUsersResponse = {
  data: AdminUser[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};

/** A destructive control's availability, decided server-side. */
export type Capability = { allowed: boolean; reason: string | null };

export type AdminUserDetail = {
  user: AdminUser;
  profile: Record<string, unknown> | null;
  recent_workouts: Array<{
    id: number;
    started_at: string | null;
    completed_at: string | null;
    status: string;
    total_sets: number;
    total_volume_kg: number;
  }>;
  stats: {
    total_workouts: number;
    workouts_30d: number;
    total_sets: number;
    volume_all_time_kg: number;
    goals_count: number;
    chat_messages_total: number;
    active_tokens: number;
  };
  chat_sessions: Array<{
    id: number;
    title: string | null;
    last_message_at: string | null;
    messages_count: number;
    has_images: boolean;
  }>;
  capabilities: {
    suspend: Capability;
    revoke_admin: Capability;
    delete: Capability;
  };
};

export type AdminAuditLog = {
  id: number;
  actor_id: number | null;
  actor_name: string;
  target_user_id: number | null;
  target_label: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
};

export type AdminAuditLogsResponse = {
  data: AdminAuditLog[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
  actions: string[];
};

export type SecuritySummary = {
  total_attempts: number;
  failed_attempts: number;
  successful_attempts: number;
  failure_rate: number;
  distinct_ips: number;
  distinct_emails: number;
  locked_accounts: number;
};

export type SecurityIpRow = {
  ip_address: string;
  failures: number;
  distinct_emails: number;
  last_seen_at: string | null;
};

export type SecurityAccountRow = {
  email: string;
  failures: number;
  distinct_ips: number;
  last_seen_at: string | null;
};

export type SecurityAttempt = {
  id: number;
  email: string | null;
  ip_address: string;
  successful: boolean;
  user_agent: string | null;
  created_at: string | null;
};

export type AdminSecurityResponse = {
  window_days: number;
  summary: SecuritySummary;
  top_offending_ips: SecurityIpRow[];
  top_targeted_accounts: SecurityAccountRow[];
  recent_attempts: SecurityAttempt[];
};
