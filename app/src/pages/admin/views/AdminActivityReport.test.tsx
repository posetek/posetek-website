import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { expandedRequest } from '../../insights/lib/expandedQuery';
import { previewInsights } from '../../insights/lib/preview';
import type { ExpandedInsights } from '../../insights/lib/expanded';
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
const report: AdminActivityReportData = {
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
  it('uses complete server groups and rankings independently of the displayed player page', () => {
    const html = render('overview');
    expect(html).toContain('Timer leader'); expect(html).toContain('100 min');
    expect(html.indexOf('Server first')).toBeLessThan(html.indexOf('Server second'));
    expect(html).toContain('<strong>8</strong><span>No recorded sign-in</span>');
    expect(html).toContain('<strong>9</strong><span>Unfinished assigned workouts</span>');
    expect(html).toContain('<strong>11</strong><span>No completed workouts</span>');
    expect(html).toContain('1–1 of 42');
    expect(html).toContain('before name search, follow-up selection and pagination');
  });
  it('keeps account evidence, unavailable sign-in and collection coverage distinct', () => {
    const data = fixture();
    data.players[0].adminReporting = { ...facts, signIn: { status: 'unknown', lastSignInAtMillis: null } };
    const html = render('overview', data);
    expect(html).toContain('Sign-in evidence unavailable');
    expect(html).toContain('2 players have unavailable sign-in evidence');
    expect(html).toContain('4 have no usage collection');
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
  it('does not turn missing usage or missing additive data into measured zero', () => {
    const data = fixture();
    data.adminReporting = undefined;
    data.players[0].adminReporting = undefined;
    data.usage.collectedPlayers = 0;
    data.players[0].usage = { ...data.players[0].usage, collected: false, webCollected: false, iosCollected: false, activeDays: 0, activeMinutes: 0 };
    const html = render('usage', data);
    expect(html).toContain('Detailed account activity is unavailable');
    expect(html).toContain('Activity window unavailable');
    expect(html).toContain('<dt>Active players</dt><dd>Not collected</dd>');
    expect(html).not.toContain('id="activity-workout-rank"');
    expect(html).not.toContain('role="group" aria-label="Explore follow-up groups"');
  });
  it('preserves team denominators, sign-in unknowns and duration-source coverage', () => {
    const html = render('overview');
    expect(html).toContain('Team activity in this reporting scope');
    expect(html).toContain('32/42'); expect(html).toContain('35/42');
    expect(html).toContain('32/42 · 76%'); expect(html).toContain('35/42 · 83%');
    expect(html).toContain('38/42 with collection'); expect(html).toContain('2 unavailable');
    expect(html).toContain('22 timer logs · 3 estimated logs');
    expect(html).toContain('teamId=harbor');
  });
  it('offers keyboard summary drilldowns with the current scope and a focusable people heading', () => {
    const html = render('overview');
    for (const title of ['Players in this selection', 'Active players', 'Estimated app use']) expect(html).toContain(`aria-label="Show players: ${title}"`);
    expect(html).toContain('id="activity-people-title" tabindex="-1"');
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
});
