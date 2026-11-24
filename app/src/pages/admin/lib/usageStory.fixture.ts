import type { UsageCohorts, UsageCohortGroup, PlayerUsageCohort, UsageSegmentKey } from './usageStory';
import { USAGE_COHORT_GROUPS } from './usageStory';
export const SYNTHETIC_USAGE_AT = Date.UTC(2026, 10, 16, 20);
export function usageStoryFixture(): UsageCohorts {
  const current = { activePlayers: 5, repeatPlayers: 1, newPlayers: 1, existingPlayers: 3, unknownHistoryPlayers: 1, activeMinutes: 20, status: 'partial' as const };
  const previous = { ...current, activePlayers: 3, repeatPlayers: 3, status: 'available' as const };
  const groups: Record<UsageCohortGroup, number | null> = { all: 6, active: 5, new: 1, existing: 3, unknown_history: 1, retained: 2, reactivated: 1, repeat_retained: 1, added: 2, weekly_not_yet_returned: 1, repeat_not_yet_returned: 1, repeat_returned_once: 1, unknown: 1 };
  const desktop = { current, previous, groups, followUp: { weeklyNotYetReturned: 1, repeatNotYetReturned: 1, repeatReturnedOnce: 1, unknown: 1 } };
  const missing = { activePlayers: null, repeatPlayers: null, newPlayers: null, existingPlayers: null, unknownHistoryPlayers: null, activeMinutes: null, status: 'unavailable' as const };
  return { version: 1, windows: { current: { startDate: '2026-11-16', endDate: '2026-11-18' }, previous: { startDate: '2026-11-09', endDate: '2026-11-15' } }, coverageStartedAtMillis: Date.UTC(2026, 10, 1),
    segments: { desktop_web: desktop, all: desktop,
      mobile_web: { ...desktop, current: { ...current, activePlayers: 2, newPlayers: 0, existingPlayers: 2, unknownHistoryPlayers: 0 }, groups: { ...groups, active: 2, new: 0, existing: 2 } },
      ios: { current: missing, previous: missing, groups: Object.fromEntries(USAGE_COHORT_GROUPS.map(key => [key, null])) as Record<UsageCohortGroup, null>, followUp: { weeklyNotYetReturned: null, repeatNotYetReturned: null, repeatReturnedOnce: null, unknown: null } },
      unknown_web: { ...desktop, current: { ...current, activePlayers: 1, newPlayers: 0, existingPlayers: 0, unknownHistoryPlayers: 1 } },
    } };
}
const cohortRows: PlayerUsageCohort[] = [
  { activeDays: 1, previousActiveDays: 0, lastActivityAtMillis: SYNTHETIC_USAGE_AT, history: 'new', followUp: 'none', previousRepeat: false },
  { activeDays: 2, previousActiveDays: 3, lastActivityAtMillis: SYNTHETIC_USAGE_AT, history: 'existing', followUp: 'returned', previousRepeat: true },
  { activeDays: 1, previousActiveDays: 2, lastActivityAtMillis: SYNTHETIC_USAGE_AT, history: 'existing', followUp: 'returned_once', previousRepeat: true },
  { activeDays: 0, previousActiveDays: 3, lastActivityAtMillis: SYNTHETIC_USAGE_AT - 7 * 86400000, history: 'inactive', followUp: 'not_yet_returned', previousRepeat: true },
  { activeDays: 1, previousActiveDays: null, lastActivityAtMillis: SYNTHETIC_USAGE_AT, history: 'unknown', followUp: 'unknown', previousRepeat: false },
  { activeDays: 1, previousActiveDays: 0, lastActivityAtMillis: SYNTHETIC_USAGE_AT, history: 'existing', followUp: 'none', previousRepeat: false },
];
export function usagePlayerFixture(index: number): Record<UsageSegmentKey, PlayerUsageCohort> {
  const row = cohortRows[index % cohortRows.length];
  return { desktop_web: row, mobile_web: row, ios: { ...row, activeDays: null, previousActiveDays: null, followUp: 'unknown' }, all: row, unknown_web: row };
}
export function usageFixtureIndexes(group: string): number[] {
  return ({ all: [0, 1, 2, 3, 4, 5], active: [0, 1, 2, 4, 5], new: [0], existing: [1, 2, 5], unknown_history: [4], retained: [1, 2], reactivated: [5], repeat_retained: [1], added: [0, 5], weekly_not_yet_returned: [3], repeat_not_yet_returned: [3], repeat_returned_once: [2], unknown: [4] }[group] || []);
}
