/**
 * Types and fetchers for the progression system (XP, level, badges).
 *
 * Kept in one module so the sidebar, the achievements page, the leaderboard and
 * the reward screen all read the same shape. When four surfaces render the same
 * number, a duplicated interface is how they end up disagreeing.
 */

import { apiClient } from "@/lib/api";

/**
 * Window event fired when a workout pushes the member into a new level.
 *
 * Shared as a constant because two lanes meet here — the reward screen emits it
 * and the layout listens — and a typo in either literal would fail silently,
 * producing a celebration that never plays. `detail` is
 * `{ level: number, progression: Progression }`.
 */
export const LEVEL_UP_EVENT = "striv:levelup";

/**
 * Fired when the signed-in member's own user object changes in a way the chrome
 * should reflect immediately — currently a new profile photo.
 *
 * The sidebar and the profile page hold separate copies of the user, so without
 * this the rail keeps showing the old photo (or initials) until the next reload.
 * A DOM event rather than shared state because the two live in different
 * subtrees: the profile page cannot reach into AppLayout, and threading a
 * callback through every page that might change a photo would couple them all to
 * this feature.
 *
 * The detail is the updated user object, so the listener can adopt it wholesale
 * rather than merging fields it does not know about.
 */
export const USER_UPDATED_EVENT = "striv:user-updated";

/** Mirrors XpService::progressFor(). */
export interface Progression {
  level: number;
  current_xp: number;
  total_xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  xp_to_next_level: number;
  progress_percent: number;
  next_level: number;
  rank: number | null;
}

/** A badge, earned or not. Locked ones are shown so there is something to aim at. */
export interface AchievementBadge {
  key: string;
  name_key: string;
  description_key: string;
  icon: string;
  category: "milestone" | "streak" | "strength" | "consistency";
  xp_reward: number;
  unlocked: boolean;
  unlocked_at: string | null;
  seen: boolean;
}

/** An unlocked badge the member has not been shown yet. */
export interface UnseenBadge {
  key: string;
  name_key: string;
  icon: string;
  xp_reward: number;
  unlocked_at: string | null;
}

/** One line in the XP ledger. */
export interface XpEvent {
  id: number;
  source: string;
  amount: number;
  label: string | null;
  created_at: string | null;
}

export interface ProgressionStats {
  progress: Progression;
  achievements: { earned: number; total: number };
  unseen: UnseenBadge[];
  daily: { cap: number; remaining: number };
  recent_events: XpEvent[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  level: number;
  xp: number;
  is_me: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export function fetchProgression(): Promise<ProgressionStats> {
  return apiClient.get<ProgressionStats>("/me/stats");
}

export function fetchAchievements(): Promise<{ achievements: AchievementBadge[] }> {
  return apiClient.get<{ achievements: AchievementBadge[] }>("/me/achievements");
}

export function markAchievementsSeen(keys: string[]): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>("/me/achievements/seen", { keys });
}

export function fetchLeaderboard(): Promise<LeaderboardResponse> {
  return apiClient.get<LeaderboardResponse>("/leaderboard");
}

/** A badge unlocked at the moment a session finished. */
export interface UnlockedBadge {
  key: string;
  name_key: string;
  description_key: string;
  icon: string;
  xp_reward: number;
}

/**
 * XP awarded when a workout finishes.
 *
 * `progress` is the level state AFTER the session's awards — the reward screen
 * must not recompute it, or it could show a level the ledger disagrees with.
 */
export interface SessionXp {
  earned: number;
  progress: Progression;
  leveled_up: boolean;
  previous_level: number;
}

/**
 * Map a ledger `source` to its translation key.
 *
 * The backend stores a machine key; the label is resolved here so the wording
 * follows the member's language. An unknown source falls back to a generic
 * entry rather than rendering the raw key.
 */
export function xpSourceKey(source: string): string {
  const known = [
    "workout_completed",
    "proven_set",
    "pr_set",
    "schedule_kept",
    "streak_week",
    "session_missed",
    "achievement",
  ];

  return known.includes(source) ? `xp.${source}` : "xp.workout_completed";
}
