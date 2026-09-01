export interface DashboardStats {
  workouts_last_30d: number;
  sets_last_30d: number;
  volume_last_30d: number;
  volume_prev_30d: number;
  strength_trend_pct: number | null;
  recent_prs: RecentPR[];
  weekly_volume: WeeklyVolume[];
}

export interface RecentPR {
  id: number;
  exercise_id: number;
  exercise: {
    name: string;
  };
  pr_type: string;
  value: number;
  achieved_at: string;
}

export interface WeeklyVolume {
  week_start: string;
  volume: number;
}