import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player' } }, db: {}, cloud: {}, storage: {} }));
import PlayerHome from './PlayerHome';
import { DEMO_REPORT } from '../report';
import type { ReportState } from '../report';
import type { PlayerTabProps } from '../workspace';

const report = (withReport: boolean): ReportState => ({ report: withReport ? { ...DEMO_REPORT, playerId: 'preview-player' } : null, limitedComparison: false, error: null, loading: false, reload: () => {} });

function render(query: string, { access = 'preview', withReport = true } = {}) {
  const props = {
    ctx: { access, playerId: 'preview-player', athlete: { name: 'Avery Demo' }, notify: () => {}, allStatsReps: () => [] },
    route: { view: 'home', screen: null, page: 'tests', drill: 'shooting', session: null, rep: null },
    go: () => {}, back: () => {}, active: true, preview: access === 'preview', athlete: { name: 'Avery Demo' }, reps: {},
    personal: {}, report: report(withReport),
  } as unknown as PlayerTabProps;
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/athlete?preview=1&view=home${query}`]}><PlayerHome {...props} /></MemoryRouter>);
}

describe('Home (AthleteWorkspaceHome)', () => {
  it('puts the week first, then organization activity with the sample cards and no scope menu', () => {
    const html = render('');
    expect(html).toContain('<h1>Home</h1>');
    for (const text of ['Your week', 'Last 7 days', '3 recorded sessions', 'Previous week: 2 recorded.']) expect(html).toContain(text);
    expect(html.indexOf('Your week')).toBeLessThan(html.indexOf('Organization activity'));
    expect(html).toContain('<h2>Organization activity</h2><p>Summit Demo FC</p>');
    for (const title of ['Shooting session', 'Build strength. Move faster.', 'Morning run']) expect(html).toContain(title);
    expect(html).toContain('104 benchmark rating');
    expect(html).toContain('You’re all caught up. Time to put in the work.');
    expect(html).not.toContain('Show posts from');
    expect(html).not.toContain('Recent workouts');
  });
  it('shows the report focus with its caption, and the progression line without a report', () => {
    expect(render('')).toContain('Practice next: Left-course dribble');
    expect(render('')).toContain('Latest testing · ');
    const plain = render('', { withReport: false });
    expect(plain).toContain('Split squat: 3 sets completed, compared with 2 last time.');
    expect(plain).toContain('Workout · ');
  });
  it('lists recent workouts when organization activity is off', () => {
    const html = render('&homePreview=feed-off');
    expect(html).toContain('Organization activity is turned off.');
    expect(html).toContain('<h3 class="home-recap-subtitle">Recent workouts</h3>');
    expect(html).toContain('Sprint · Jump');
    expect(html).not.toContain('Summit Demo FC');
  });
  it('shows each feed state in the app’s words', () => {
    expect(render('&homePreview=feed-settings-error')).toContain('Organization activity settings could not be loaded.');
    expect(render('&homePreview=feed-settings-loading')).toContain('Loading organization settings');
    expect(render('&homePreview=feed-loading')).toContain('Loading your feed…');
    const empty = render('&homePreview=feed-empty');
    expect(empty).toContain('Your People.<br/>Your Progress.');
    expect(empty).toContain('Finished workouts and measured sessions will appear here as your community trains.');
    const failed = render('&homePreview=feed-error');
    expect(failed).toContain('Let’s Try That<br/>Again.');
    expect(failed).toContain('Retry');
    expect(failed).toContain('Recent workouts');
  });
  it('shows the week states', () => {
    expect(render('&homePreview=week-loading')).toContain('Loading recent workouts');
    expect(render('&homePreview=week-failed')).toContain('Reload recent workouts');
    const empty = render('&homePreview=week-empty');
    expect(empty).toContain('0 recorded sessions');
    expect(empty).toContain('Your next completed workout will appear here.');
  });
  it('names the athlete for a staff viewer', () => {
    expect(render('&homePreview=week-empty', { access: 'coach' })).toContain('Avery Demo’s week');
  });
});
