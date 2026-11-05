/** Additive complete-cohort reporting. Absent extensions mean unsupported,
 * never zero. Weekly windows cover matching local weekdays. */
export interface AdminMetricValue {
  value: number | null;
  previousValue: number | null;
  status: 'available' | 'partial' | 'unavailable';
  note: string;
}
export interface AdminReportingMetrics {
  version: 1;
  windows: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  topTrainingPlayers?: { id: string; name: string; activeMinutes: number }[];
  cards: Record<'testedPlayers' | 'claimedAccounts' | 'iosDownloads' | 'repeatUsers' | 'weeklyUsers' | 'platformMinutes', AdminMetricValue>;
}
export type { AdminTesting as AdminTestingMetrics } from './workspaceTesting';
