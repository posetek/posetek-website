/** Additive, player-account-only reporting. Older services can omit these fields. */
export const USAGE_CLIENTS = ['desktop_web', 'mobile_web', 'ios'] as const;
export type UsageClient = typeof USAGE_CLIENTS[number];
export type UsageSegmentKey = UsageClient | 'all' | 'unknown_web';
export const USAGE_CLIENT_LABELS: Record<UsageSegmentKey, string> = {
  desktop_web: 'Desktop website', mobile_web: 'Mobile website', ios: 'Native iOS app',
  all: 'All platforms · distinct players', unknown_web: 'Browser type unknown',
};
export const USAGE_COHORT_GROUPS = ['all', 'active', 'new', 'existing', 'unknown_history', 'retained', 'reactivated', 'repeat_retained', 'added', 'weekly_not_yet_returned', 'repeat_not_yet_returned', 'repeat_returned_once', 'unknown'] as const;
export type UsageCohortGroup = typeof USAGE_COHORT_GROUPS[number];
export const USAGE_GROUP_LABELS: Record<UsageCohortGroup, string> = {
  all: 'All players', active: 'Active this week', new: 'First recorded use', existing: 'Previously active',
  unknown_history: 'History unknown', retained: 'Active in both weeks', reactivated: 'Returned after a gap',
  repeat_retained: 'Repeat users in both weeks', added: 'Active this week, not last week',
  weekly_not_yet_returned: 'Not yet returned this week', repeat_not_yet_returned: 'Previous repeat users · no recorded return',
  repeat_returned_once: 'Previous repeat users · returned on one day', unknown: 'Comparison coverage unknown',
};
export type UsageCohortWeek = {
  activePlayers: number | null; repeatPlayers: number | null; newPlayers: number | null; existingPlayers: number | null;
  unknownHistoryPlayers: number | null; activeMinutes: number | null; status: 'available' | 'partial' | 'unavailable';
};
export type PlayerUsageCohort = {
  activeDays: number | null; previousActiveDays: number | null; lastActivityAtMillis: number | null;
  history: 'new' | 'existing' | 'unknown' | 'inactive';
  followUp: 'not_yet_returned' | 'returned_once' | 'returned' | 'unknown' | 'none'; previousRepeat: boolean;
};
export type UsageCohorts = {
  version: 1; windows: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  coverageStartedAtMillis: number | null;
  supportedIOSBuilds?: string[];
  segments: Record<UsageSegmentKey, { current: UsageCohortWeek; previous: UsageCohortWeek;
    groups: Record<UsageCohortGroup, number | null>;
    followUp: { weeklyNotYetReturned: number | null; repeatNotYetReturned: number | null; repeatReturnedOnce: number | null; unknown: number | null } }>;
};
export function usageShare(value: number | null, total: number | null) {
  return value === null || total === null || total <= 0 ? '—' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value * 100 / total)}%`;
}
export function usageChangeSummary(segment: UsageCohorts['segments'][UsageSegmentKey]) {
  const { current, previous, groups } = segment;
  if (current.status === 'unavailable' || previous.status === 'unavailable') return 'A weekly comparison is not yet available for this platform.';
  const count = (value: number | null) => value === null ? 'unavailable' : String(value);
  return `${count(current.activePlayers)} players active this week so far; ${count(previous.activePlayers)} last week. `
    + `${count(groups.retained)} active in both weeks, ${count(groups.added)} added to this week’s active group, `
    + `${count(groups.weekly_not_yet_returned)} not yet returned. Missing coverage is reported separately.`;
}
