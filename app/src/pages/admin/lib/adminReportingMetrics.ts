/** Additive complete-cohort reporting. Absent extensions mean unsupported,
 * never zero. `previous` is the whole Monday–Sunday week before `current`; a
 * reporting service published before November 10 sends matching weekdays
 * instead. `cumulative` names the cutoffs of the cumulative cards when present. */
export interface AdminMetricValue {
  value: number | null;
  previousValue: number | null;
  status: 'available' | 'partial' | 'unavailable';
  note: string;
}
export interface AdminReportingMetrics {
  version: 1;
  windows: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string };
    cumulative?: { endDate: string; previousEndDate: string } };
  topTrainingPlayers?: { id: string; name: string; activeMinutes: number }[];
  cards: Record<'testedPlayers' | 'claimedAccounts' | 'iosDownloads' | 'repeatUsers' | 'weeklyUsers' | 'platformMinutes', AdminMetricValue>;
}
export type { AdminTesting as AdminTestingMetrics } from './workspaceTesting';
