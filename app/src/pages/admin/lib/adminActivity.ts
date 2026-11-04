import type { UsageFeature } from "../../../lib/insight-usage/clock";

/** Optional admin-only reporting. Account and assignment facts are current at
 * asOfMillis; period totals and retained usage windows keep their own clocks. */
export const ADMIN_ACTIVITY_FOLLOW_UPS = ["all", "active", "noSignIn", "noActivity", "unfinishedAssigned", "noCompletion"] as const;
export const ADMIN_ACTIVITY_SORTS = ["name", "activeMinutes", "workoutMinutes", "lastActivity", "lastWorkout", "unfinishedAssigned"] as const;
export type AdminActivityFollowUp = typeof ADMIN_ACTIVITY_FOLLOW_UPS[number];
export type AdminActivitySort = typeof ADMIN_ACTIVITY_SORTS[number];
export interface AdminActivityRequest { version: 1; followUp: AdminActivityFollowUp; sort: AdminActivitySort }

export interface AdminPlayerActivity {
  signIn: { status: "recorded" | "none" | "unlinked" | "unknown"; lastSignInAtMillis: number | null };
  usage: { lastActivityWindow: {
    startMillis: number;
    endMillis: number;
    featureEvidence?: { basis: "latestInterval" | "window"; features: UsageFeature[] };
  } | null };
  workouts: { latest: {
    source: "workoutLogs" | "personalWorkoutLogs"; logId: string; title: string;
    startedAtMillis: number | null; endedAtMillis: number | null; status: string;
    timerMinutes: number | null; estimatedMinutes: number | null; setsCompleted: number;
  } | null };
  assigned: { status: "available" | "noActivePlan" | "unavailable"; weekNumber: number | null; remaining: number | null; notStarted: number | null; noEnding: number | null };
}
export interface AdminActivityTeam {
  organizationId: string; teamId: string | null; name: string; players: number;
  collectedPlayers: number; activePlayers: number; activeMinutes: number;
  workoutStarted: number; workoutCompleted: number;
  signInRecordedPlayers: number; signInNonePlayers: number; signInUnlinkedPlayers: number; signInUnknownPlayers: number;
  timerMinutes: number; estimatedMinutes: number; timerRecords: number; estimatedRecords: number;
}
export interface AdminActivityReportData {
  version: 1; followUp: AdminActivityFollowUp; sort: AdminActivitySort; asOfMillis: number; population: number;
  summary: { noSignIn: number; noActivity: number; unfinishedAssigned: number; noCompletion: number; signInUnknown: number; usageNotCollected: number };
  topActivePlayers: { id: string; name: string; activeMinutes: number }[];
  topWorkoutPlayers: { id: string; name: string; timerMinutes: number }[];
  teams: AdminActivityTeam[];
}
export function adminActivitySelection(view: string, followUp?: string, sort?: string): AdminActivityRequest {
  return { version: 1,
    followUp: ADMIN_ACTIVITY_FOLLOW_UPS.includes(followUp as AdminActivityFollowUp) ? followUp as AdminActivityFollowUp : "all",
    sort: ADMIN_ACTIVITY_SORTS.includes(sort as AdminActivitySort) ? sort as AdminActivitySort : view === "usage" ? "lastActivity" : view === "workouts" ? "lastWorkout" : "name",
  };
}
