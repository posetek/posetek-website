import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { expandedRequest } from '../../insights/lib/expandedQuery';
import { previewInsights } from '../../insights/lib/preview';
import type { ExpandedInsights } from '../../insights/lib/expanded';
import type { AdminReportingMetrics } from '../lib/adminReportingMetrics';
import type { AdminActivityReportData, AdminPlayerActivity } from '../lib/adminActivity';
import AdminActivityReport, { TeamComparison } from './AdminActivityReport';
import { activityDate, activityWindow, exactWorkoutLink } from '../lib/adminActivityPresentation';

const request = expandedRequest('', new Date('2026-11-03T18:00:00Z'));
const facts: AdminPlayerActivity = {
  signIn: { status: 'recorded', lastSignInAtMillis: Date.parse('2026-11-03T15:30:00Z') },
  usage: { lastActivityWindow: { startMillis: Date.parse('2026-11-02T18:00:00Z'), endMillis: Date.parse('2026-11-02T18:15:00Z') } },
  workouts: { latest: { source: 'workoutLogs', logId: 'saved session & one', title: 'Saved passing workout', startedAtMillis: Date.parse('2026-11-03T16:00:00Z'), endedAtMillis: null, status: 'inProgress', timerMinutes: 0, estimatedMinutes: null, setsCompleted: 1 } },
  assigned: { status: 'available', weekNumber: 2, remaining: 0, notStarted: 0, noEnding: 0 },
};
const metric = { value: 24, previousValue: 20, status: 'available' as const, note: 'Complete reporting cohort' };
const metrics: AdminReportingMetrics = {
  version: 1, windows: { current: { startDate: '2026-11-02', endDate: '2026-11-03' }, previous: { startDate: '2026-10-26', endDate: '2026-10-27' } },
  cards: { testedPlayers: metric, claimedAccounts: metric, iosDownloads: metric, repeatUsers: { value: null, previousValue: null, status: 'unavailable', note: 'Visits are not collected' }, weeklyUsers: metric, platformMinutes: { ...metric, value: 64.5 } },
  topTrainingPlayers: [{ id: 'outside-page-d', name: 'Training leader', activeMinutes: 75 }],
};
const report: AdminActivityReportData = {
  metricsV2: metrics,
  version: 1, followUp: 'all', sort: 'name', asOfMillis: Date.parse('2026-11-03T18:00:00Z'), population: 42,
  summary: { noSignIn: 8, noActivity: 3, unfinishedAssigned: 9, noCompletion: 11, signInUnknown: 2, usageNotCollected: 4 },
  // These names intentionally do not belong to the displayed player page.
  topActivePlayers: [{ id: 'outside-page-a', name: 'Server first', activeMinutes: 4 }, { id: 'outside-page-b', name: 'Server second', activeMinutes: 40 }],
  topWorkoutPlayers: [{ id: 'outside-page-c', name: 'Timer leader', timerMinutes: 100 }],
  teams: [{ organizationId: 'northfield', teamId: 'harbor', name: 'Harbor team', players: 42, collectedPlayers: 38, activePlayers: 35, activeMinutes: 500, workoutStarted: 30, workoutCompleted: 20, signInRecordedPlayers: 32, signInNonePlayers: 6, signInUnlinkedPlayers: 2, signInUnknownPlayers: 2, timerMinutes: 250, estimatedMinutes: 20, timerRecords: 22, estimatedRecords: 3 }],
};
function fixture(): ExpandedInsights {
  const base = previewInsights(request);
  return { ...base, adminReporting: report, players: [{ ...base.players[0], id: 'p-one', firstName: 'Alex', lastName: 'Player', adminReporting: facts }], pagination: { total: 42, pageSize: 20, nextCursor: 'next-server-cursor' } };
}
const playerLink = (id: string, panel: string) => `/admin/accounts/player/${id}?playerTab=${panel}&reportView=workouts&returnTo=%2Fadmin%2Faccounts%3ForgId%3Dnorthfield`;
const render = (view: 'overview' | 'workouts' | 'usage', data = fixture()) => renderToStaticMarkup(<MemoryRouter><AdminActivityReport data={data} request={{ ...request, view }} view={view} onChange={() => {}} onFirstPage={() => {}} onNextPage={() => {}} playerLink={playerLink} teamLink={(orgId, teamId) => `/admin/accounts?orgId=${orgId}&teamId=${teamId || ''}`} /></MemoryRouter>);

describe('admin activity reporting presentation', () => {
  it('uses complete server activity rankings independently of the displayed player page', () => {
    const html = render('overview');
    expect(html).toContain('Training leader'); expect(html).toContain('75 min');
    expect(html).not.toContain('Timer leader');
    expect(html.indexOf('Server first')).toBeLessThan(html.indexOf('Server second'));
    expect(html).toContain('Most workout activity'); expect(html).toContain('Most time on platform');
    expect(html).toContain('1–1 of 42');
    expect(html).not.toContain('Explore follow-up groups');
    expect(html).not.toContain('Compare teams');
    expect(html).toContain('Participation and usage summary');
  });
  it('keeps unavailable account evidence and missing collection distinct in player rows', () => {
    const data = fixture();
    data.players[0].adminReporting = { ...facts, signIn: { status: 'unknown', lastSignInAtMillis: null } };
    data.players[0].usage = { ...data.players[0].usage, collected: false };
    const html = render('overview', data);
    expect(html).toContain('Sign-in evidence unavailable');
    expect(html).toContain('Collection unavailable');
    expect(html).toContain('A recorded sign-in does not mean the player is online');
    expect(html).toContain('current account and workout facts, even when the reporting period is historical');
    expect(html).not.toContain('Never logged in');
  });
  it('shows exact saved-workout navigation, an explicit opener, and known zero remaining assignments', () => {
    const html = render('workouts');
    expect(html).toContain('Saved passing workout');
    expect(html).toContain('workoutSource=workoutLogs');
    expect(html).toContain('workoutLog=saved+session+%26+one');
    expect(html).toContain('returnTo=%2Fadmin%2Faccounts%3ForgId%3Dnorthfield');
    expect(html).toContain('Show recent workouts for Alex Player');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('0 remaining');
    expect(html).toContain('0 min recorded timer');
    expect(html).toContain('No ending recorded');
    expect(html).not.toContain('Loading recent workouts');
  });
  it('labels coarse last-use windows without claiming a stop or logout time', () => {
    const html = render('usage');
    expect(html).toContain('15-minute retained activity window');
    expect(html).toContain('Nov 2, 2026, 10:00 AM – 10:15 AM');
    expect(html).toContain('not a precise logout or stopping time');
    expect(html).toContain('may precede the selected period');
    expect(html).toContain('data-label="Platforms"');
  });
  it('shows the feature observed in the latest interval with its window in the report timezone', () => {
    const data = fixture();
    data.period = { ...data.period, timeZone: 'America/New_York' };
    data.players[0].adminReporting = { ...facts, usage: { lastActivityWindow: { ...facts.usage.lastActivityWindow!, featureEvidence: { basis: 'latestInterval', features: ['training'] } } } };
    const html = render('usage', data);
    expect(html).toContain('<th scope="col">Last observed feature</th>');
    expect(html).toContain('data-label="Last observed feature"><strong>Training</strong>');
    expect(html).toContain('Latest measured interval');
    expect(html).toContain('Nov 2, 2026, 1:00 PM – 1:15 PM');
    expect(html).toContain('America/New_York');
  });
  it('distinguishes tied intervals, unordered summary features, and absent feature evidence', () => {
    const data = fixture();
    const window = facts.usage.lastActivityWindow!;
    for (const basis of ['latestInterval', 'window'] as const) {
      data.players[0].adminReporting = { ...facts, usage: { lastActivityWindow: { ...window, featureEvidence: { basis, features: ['workout', 'video'] } } } };
      const html = render('usage', data);
      expect(html).toContain('<strong>Workouts, Video</strong>');
      expect(html).toContain(basis === 'window' ? 'Window summary · order unknown' : 'Latest observations tied');
    }
    data.players[0].adminReporting = facts;
    const older = render('usage', data);
    expect(older).toContain('<strong>Feature unavailable</strong>');
    expect(older).toContain('Nov 2, 2026, 10:00 AM – 10:15 AM');
    data.players[0].adminReporting = { ...facts, usage: { lastActivityWindow: null } };
    expect(render('usage', data)).toContain('No retained activity window');
    data.players[0].usage = { ...data.players[0].usage, collected: false };
    expect(render('usage', data)).toContain('data-label="Last observed feature"><span class="activity-missing">Not collected</span>');
  });
  it('does not turn missing usage or missing additive data into measured zero', () => {
    const data = fixture();
    data.adminReporting = undefined;
    data.players[0].adminReporting = undefined;
    data.usage.collectedPlayers = 0;
    data.players[0].usage = { ...data.players[0].usage, collected: false, webCollected: false, iosCollected: false, activeDays: 0, activeMinutes: 0 };
    const html = render('usage', data);
    expect(html).toContain('Detailed account activity is unavailable');
    expect(html).toContain('Activity window unavailable');
    expect(html).toContain('Updated reporting unavailable');
    expect(html).toContain('data-label="Estimated app use"><strong>Not collected</strong>');
    expect(html).not.toContain('id="activity-workout-rank"');
    expect(html).not.toContain('role="group" aria-label="Explore follow-up groups"');
  });
  it('preserves team denominators, sign-in unknowns and duration-source coverage', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TeamComparison data={fixture()} teamLink={(orgId, teamId) => `/admin/accounts?orgId=${orgId}&teamId=${teamId}`} /></MemoryRouter>);
    expect(html).toContain('Team activity in this reporting scope');
    expect(html).toContain('32/42'); expect(html).toContain('35/42');
    expect(html).toContain('32/42 · 76%'); expect(html).toContain('35/42 · 83%');
    expect(html).toContain('38/42 with collection'); expect(html).toContain('2 unavailable');
    expect(html).toContain('22 timer logs · 3 estimated logs');
    expect(html).toContain('teamId=harbor');
  });
  it('keeps the people heading focusable and places charts before the player table', () => {
    const html = render('overview');
    expect(html).toContain('aria-label="Sort players"');
    expect(html).toContain('Find a player in this report');
    const withChart = renderToStaticMarkup(<MemoryRouter><AdminActivityReport data={fixture()} request={request} view="overview" onChange={() => {}} onFirstPage={() => {}} onNextPage={() => {}} playerLink={playerLink} teamLink={() => '#team'}><section aria-label="Daily charts">Trend evidence</section></AdminActivityReport></MemoryRouter>);
    expect(withChart.indexOf('Daily charts')).toBeLessThan(withChart.indexOf('activity-people-title'));
    expect(html).toContain('id="activity-people-title" tabindex="-1"');
  });
  it.each(['workouts', 'usage'] as const)('places the %s player section after every chart and measurement disclosure', view => {
    const html = render(view);
    expect(html.indexOf('class="activity-method"')).toBeLessThan(html.indexOf('aria-labelledby="activity-people-title"'));
    expect(html.slice(html.indexOf('aria-label="Activity player pages"'))).not.toContain('<details');
  });
  it('renders retained summaries without borrowing an old player page or its sort', () => {
    const { players, pagination, rosterMetrics, nameSearch, ...summary } = fixture();
    const html = renderToStaticMarkup(<MemoryRouter><AdminActivityReport data={summary} request={request} view="usage" detailsPending onChange={() => {}} onFirstPage={() => {}} onNextPage={() => {}} playerLink={playerLink} teamLink={() => '#team'} /></MemoryRouter>);
    expect(html).toContain('Participation and usage summary');
    expect(html).toContain('Loading player details…');
    expect(html).not.toContain('Alex Player');
    expect(html).not.toContain('Activity player pages');
    expect(html).not.toContain('Sort players');
  });
  it('retains coach identity when the team comparison replaces navigation cards', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TeamComparison data={fixture()} teamLink={() => '/admin/accounts?teamId=harbor'} coachNames={{ 'northfield/harbor': 'Coach Taylor' }} /></MemoryRouter>);
    expect(html).toContain('Coach Taylor');
    expect(html).toContain('Harbor team');
  });
  it('preserves exact workout identity and existing return/filter query values', () => {
    const link = exactWorkoutLink(playerLink('p-one', 'workouts'), facts.workouts.latest!);
    const url = new URL(link, 'https://posetek.net');
    expect(url.searchParams.get('workoutLog')).toBe('saved session & one');
    expect(url.searchParams.get('workoutSource')).toBe('workoutLogs');
    expect(url.searchParams.get('returnTo')).toBe('/admin/accounts?orgId=northfield');
    expect(url.searchParams.get('reportView')).toBe('workouts');
  });
  it('keeps absent timestamps explicit and permits a known epoch timestamp', () => {
    expect(activityDate(null, 'UTC')).toBe('Not recorded');
    expect(activityDate(undefined, 'UTC')).toBe('Not recorded');
    expect(activityDate(Number.NaN, 'UTC')).toBe('Not recorded');
    expect(activityDate(0, 'UTC')).toContain('Jan 1, 1970');
    expect(activityWindow(null, 'UTC')).toBe('No retained activity window');
  });
  it('shows both dates or timezone offsets when a window crosses midnight or a clock change', () => {
    const range = (start: string, end: string) => activityWindow({ startMillis: Date.parse(start), endMillis: Date.parse(end) }, 'America/New_York');
    const midnight = range('2026-11-03T04:45:00Z', '2026-11-03T05:00:00Z');
    expect(midnight).toContain('Nov 2, 2026'); expect(midnight).toContain('Nov 3, 2026');
    const repeatedHour = range('2026-11-01T05:45:00Z', '2026-11-01T06:00:00Z');
    expect(repeatedHour).toMatch(/1:45 AM EDT.*1:00 AM EST/);
  });
});
