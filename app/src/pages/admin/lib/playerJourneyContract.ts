// Shared versioned backend contract. See docs/features/PLAYER_USAGE_STORY.md.
export type ClientKind = 'desktop_web' | 'mobile_web' | 'ios' | 'unknown_web';
export type JourneyPage = 'home' | 'stats' | 'workouts' | 'plan' | 'coach' | 'training' | 'results' | 'video' | 'planner' | 'feed' | 'profile' | 'leaderboards' | 'settings' | 'saved_workouts' | 'workout_history' | 'tests' | 'other';
export type JourneyTarget = Exclude<JourneyPage, 'other'> | 'start_workout' | 'generate_plan' | 'send_message' | 'open_video' | 'download_report';
export type JourneyOutcome = 'workout_started' | 'plan_created' | 'message_sent';
export type JourneyEntry = 'sign_in' | 'signup' | 'restored' | 'open' | 'continue' | 'deep_link' | 'report_stats' | 'report_workouts';
export type ObservedExit = 'sign_out' | 'left_workspace';
export type JourneyEvent =
  | { kind: 'page_view'; page: JourneyPage; atMillis: number }
  | { kind: 'click'; page: JourneyPage; target: JourneyTarget; atMillis: number }
  | { kind: 'dwell'; page: JourneyPage; startedAtMillis: number; endedAtMillis: number }
  | { kind: 'exit'; page: JourneyPage; reason: ObservedExit; atMillis: number }
  | { kind: 'outcome'; page: JourneyPage; target: JourneyOutcome; atMillis: number };
export type RecordPlayerJourneyRequest = {
  schemaVersion: 1; playerId: string; sessionId: string; sequence: number; clientKind: ClientKind; build: string;
  entry: JourneyEntry; sessionStartedAtMillis: number; events: JourneyEvent[];
};
export type AdminPlayerJourneysRequest = {
  organizationId: string; teamId?: string; unassigned?: true; startDate: string; endDate: string; timeZone: string;
  clientKind?: ClientKind; playerId?: string; cursor?: string; pageSize?: number;
  cohort?: 'all' | 'new' | 'existing' | 'unknown'; entryFilter?: 'all' | 'sign_in';
};
export type JourneyPageTotals = { page: JourneyPage; views: number; clicks: number; activeSeconds: number };
export type JourneyPlayer = { id: string; name: string; teamId: string | null; teamName: string | null; lastActivityAtMillis: number; sessionCount: number };
export type JourneySession = {
  clientKind: ClientKind; startedAtMillis: number; lastActivityAtMillis: number; entry: JourneyEntry; firstSignIn: boolean;
  firstPage: JourneyPage | null; lastPage: JourneyPage | null; exit: ObservedExit | 'last_observed' | null;
  status: 'ended' | 'ongoing' | 'incomplete'; activeSeconds: number; pages: JourneyPageTotals[]; path: JourneyPage[];
  outcomes: { target: JourneyOutcome; count: number }[]; events: JourneyEvent[];
};
export type JourneyOverviewSegment = {
  clientKind: ClientKind; sessionCount: number; playerCount: number; firstSignInSessionCount: number; ongoingSessions: number; incompleteSessions: number;
  pages: (JourneyPageTotals & { uniquePlayers: number; medianActiveSeconds: number | null; nextPages: { page: JourneyPage; count: number }[];
    completedSessionsVisited: number; endedSessions: number; sessionEndRate: number | null })[];
  paths: { pages: JourneyPage[]; count: number }[]; lastPages: { page: JourneyPage; count: number }[];
  exits: { reason: ObservedExit | 'last_observed'; count: number }[]; outcomes: { target: JourneyOutcome; count: number }[];
};
export type AdminPlayerJourneys = { version: 1; startDate: string; endDate: string; coverageStartedAtMillis: number | null; supportedIOSBuilds?: string[]; complete: boolean; nextCursor: string | null } & (
  | { view: 'overview'; segments: JourneyOverviewSegment[]; players: JourneyPlayer[] }
  | { view: 'player'; player: { id: string; name: string }; sessions: JourneySession[] }
);
