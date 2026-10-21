import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const harness = vi.hoisted(() => ({ uid: 'owner', observer: null as null | ((user: any) => void), request: vi.fn(), stop: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({
  auth: { get currentUser() { return harness.uid ? { uid: harness.uid } : null; }, onAuthStateChanged: (callback: (user: any) => void) => { harness.observer = callback; return harness.stop; } },
  cloud: { httpsCallable: () => harness.request },
}));
import PlayerLeaderboards, { PLAYER_BOARDS, LeaderboardResults, leaderboardGroups, leaderboardRows, loadTeamStandings, playerStandings, preferredLeaderboardGroup } from './PlayerLeaderboards';

const rep = (type: string, fields: Record<string, unknown> = {}) => ({ id: 'rep', repType: type, resultStatus: { qualified: true, duplicate: false }, ...fields });
const player = (id: string, reps: any[]) => ({ id, firstName: id, reps });
const render = (players: any[], selected = 'changeOfDirection', groupId: string | null = null) => renderToStaticMarkup(<LeaderboardResults players={players} playerId="You" selected={selected} groupId={groupId} onGroupChange={() => {}} />);

describe('test-specific team comparisons', () => {
  it('lists six actual tests, including broad jump, without a mixed Overall score', () => {
    expect(PLAYER_BOARDS.map(board => board.key)).toEqual(['changeOfDirection', 'sprint', 'jump', 'broadJump', 'dribbling', 'shooting']);
    expect(playerStandings([player('You', [rep('sprint', { totalTime: 3 })])], 'overall')).toEqual([]);
  });
  it('rejects unavailable, duplicate, invalid and nonpositive results defensively', () => {
    const players = [player('unavailable', [rep('jump', { jumpHeight: .9, resultStatus: { qualified: false } })]),
      player('duplicate', [rep('jump', { jumpHeight: .8, resultStatus: { qualified: true, duplicate: true } })]),
      player('invalid', [{ repType: 'jump', jumpHeight: .7, resultsValid: false }]),
      player('zero', [rep('jump', { jumpHeight: 0 })]), player('nan', [rep('jump', { jumpHeight: 'NaN' })]),
      player('You', [rep('jump', { jumpHeight: .4 })])];
    expect(playerStandings(players, 'jump').map(row => row.id)).toEqual(['You']);
  });
  it('reads canonical metric aliases, converts units and keeps jump tests distinct', () => {
    const players = [player('You', [rep('jump', { jump_height_inches: 20 }), rep('broadJump', { broadJumpDistance: 2, jumpHeight: 1 })])];
    expect(playerStandings(players, 'jump')[0].value).toBeCloseTo(20);
    expect(playerStandings(players, 'broadJump')[0].value).toBeCloseTo(6.56168);
  });
  it('uses one best result per athlete and gives visible ties competition ranks', () => {
    const players = [player('You', [rep('dribbling', { totalTime: 5.001, courseDistanceMeters: 5 }), rep('dribbling', { totalTime: 6, courseDistanceMeters: 5 })]),
      player('Alex', [rep('dribbling', { totalTime: 5.004, courseDistanceMeters: 5 })]), player('Sam', [rep('dribbling', { totalTime: 6, courseDistanceMeters: 5 })])];
    const rows = playerStandings(players, 'dribbling');
    expect(rows.map(row => row.rank)).toEqual([1, 1, 3]);
    expect(rows.map(row => row.tied)).toEqual([true, true, false]);
    expect(render(players, 'dribbling')).toContain('Tied 1');
    expect(render(players, 'dribbling')).toContain('of 3 players with a result');
  });
  it('separates course distances without chaining and never uses tracked travel as course', () => {
    const players = [player('You', [rep('dribbling', { courseDistanceMeters: 5, totalTime: 6 })]),
      player('near', [rep('dribbling', { courseDistanceMeters: 5.2, totalTime: 5 })]),
      player('chain', [rep('dribbling', { courseDistanceMeters: 5.4, totalTime: 4 })]),
      player('other', [rep('dribbling', { courseDistanceMeters: 10, totalTime: 3 })]),
      player('travel', [rep('dribbling', { totalDistance: 5, totalTime: 2 })]),
      player('unknown', [rep('dribbling', { totalTime: 1, markerDistance: 5 })])];
    const groups = leaderboardGroups(players, 'dribbling');
    expect(groups).toHaveLength(4);
    expect(groups[0].candidates.map(row => row.playerId)).toEqual(['You', 'near']);
    expect(leaderboardRows(groups[0], 'dribbling').map(row => row.id)).toEqual(['near', 'You']);
    expect(groups.find(group => group.id === 'unknown')?.ranked).toBe(false);
    expect(render(players, 'dribbling')).toContain('of 2 players with a result');
  });
  it('keeps a single distance compact and puts calculation details after the results', () => {
    const html = render([player('You', [rep('changeOfDirection', { courseDistanceMeters: 5, totalTime: 5 })])]);
    expect(html).not.toContain('<select'); expect(html).toContain('leaderboard-course-label');
    expect(html).toContain('<details class="leaderboard-method">');
    expect(html.indexOf('within 5%')).toBeGreaterThan(html.indexOf('</table>'));
  });
  it('defaults to the player’s most recently recorded known distance', () => {
    const players = [player('You', [rep('sprint', { courseDistanceMeters: 10, totalTime: 3, createdAtMillis: 1000 }), rep('sprint', { courseDistanceMeters: 20, totalTime: 5, createdAtMillis: 2000 }), rep('sprint', { totalTime: 1, createdAtMillis: 3000 })])];
    const groups = leaderboardGroups(players, 'sprint');
    expect(preferredLeaderboardGroup(groups, 'You')).toBe('courseDistanceMeters:20');
    expect(render(players, 'sprint')).toContain('5.00 s');
    expect(render(players, 'sprint')).not.toContain('1.00 s');
  });
  it('uses the additive server course contract without splitting one sprint by tracked travel', () => {
    const players = [player('You', [rep('sprint', { totalTime: 3, distance: 9.54, totalDistance: 11, courseDistanceMeters: 10 })]),
      player('Alex', [rep('sprint', { totalTime: 2.9, distance: 11.37, courseDistanceMeters: 10 })]),
      player('unknown', [rep('sprint', { totalTime: 2, distance: 10, totalDistance: 10, markerDistance: 10 })])];
    const groups = leaderboardGroups(players, 'sprint');
    expect(groups).toHaveLength(2); expect(groups[0].candidates).toHaveLength(2);
    expect(leaderboardRows(groups[0], 'sprint').map(row => row.id)).toEqual(['Alex', 'You']);
    expect(groups[1].ranked).toBe(false);
    expect(render(players, 'sprint')).toContain('Recorded course 10.0 m');
  });
  it('shows latest unknown-distance times without comparing them or computing an average', () => {
    const players = [player('You', [rep('sprint', { totalTime: 2, createdAtMillis: 1000 }), rep('sprint', { totalTime: 5, createdAtMillis: 2000 })]), player('Alex', [rep('sprint', { totalTime: 3 })])];
    expect(playerStandings(players, 'sprint')).toEqual([]);
    const html = render(players, 'sprint');
    expect(html).toContain('Result saved · not ranked'); expect(html).toContain('Latest recorded result'); expect(html).toContain('5.00 s');
    expect(html).not.toContain('Team average'); expect(html).not.toContain('of 2 players with a result');
  });
  it('renders missing results as unranked, with the child highlighted and no zero score', () => {
    const html = render([player('You', []), player('Alex', [rep('jump', { jumpHeight: .4 })])], 'jump');
    expect(html).toContain('Not ranked yet'); expect(html).toContain('Missing results are not a score of zero.');
    expect(html).toContain('leaderboard-is-you'); expect(html).toContain('No result available'); expect(html).not.toContain('0.0 in');
  });
  it('renders a complete semantic table, real dates and simple explanations without synthetic distributions', () => {
    const html = render([player('You', [rep('broadJump', { broadJumpDistance: 2, createdAtMillis: Date.UTC(2026, 9, 20, 18) })])], 'broadJump');
    expect(html).toContain('<table'); expect(html).toContain('scope="row"'); expect(html).toContain('Farther is better');
    expect(html).toContain('Oct 20, 2026'); expect(html).not.toContain('percentile'); expect(html).not.toContain('<svg'); expect(html).not.toContain('podium');
  });
  it('does not make Firebase calls for a synthetic preview, and exposes loading for a real view', () => {
    const props = { playerId: 'You', athlete: {}, reps: [rep('changeOfDirection', { courseDistanceMeters: 5, totalTime: 5 })], dataset: {} };
    const preview = renderToStaticMarkup(<PlayerLeaderboards {...props} preview />);
    expect(preview).toContain('of 3 players with a result'); expect(harness.request).not.toHaveBeenCalled();
    const real = renderToStaticMarkup(<PlayerLeaderboards {...props} preview={false} />);
    expect(real).toContain('Loading your team results'); expect(real).not.toContain('Alex');
  });
});

describe('team load isolation and retry', () => {
  beforeEach(() => { harness.uid = 'owner'; harness.observer = null; harness.request.mockReset(); harness.stop.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  it('accepts a bounded canonical team name only after the response scope matches', async () => {
    harness.request.mockResolvedValue({ data: { playerId: 'You', teamId: 'team', organizationId: 'club', teamName: ' U13 Team ', athletes: [] } });
    const states: any[] = [], stop = loadTeamStandings({ playerId: 'You', teamId: 'team', organizationId: 'club' }, state => states.push(state));
    await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1).teamName).toBe('U13 Team'); stop();
  });
  it('clears old names immediately and ignores a response after the owner changes', async () => {
    const response = deferred(); harness.request.mockReturnValue(response.promise); const states: any[] = [];
    const stop = loadTeamStandings({ playerId: 'You' }, state => states.push(state));
    expect(states[0]).toEqual({ status: 'loading', players: [], error: '' });
    harness.uid = 'other'; harness.observer?.({ uid: 'other' });
    response.resolve({ data: { playerId: 'You', athletes: [player('Private teammate', [])] } }); await response.promise; await Promise.resolve();
    expect(states.at(-1).status).toBe('error'); expect(states.at(-1).players).toEqual([]); expect(JSON.stringify(states)).not.toContain('Private teammate');
    stop(); expect(harness.stop).toHaveBeenCalledOnce();
  });
  it.each([{ playerId: 'You', teamId: 'old' }, { playerId: 'another-player', teamId: 'current' }, { playerId: null, teamId: 'current' }])('rejects a response outside the current player/team scope: %j', async scope => {
    harness.request.mockResolvedValue({ data: { ...scope, athletes: [player('Private teammate', [])] } });
    const states: any[] = [], stop = loadTeamStandings({ playerId: 'You', teamId: 'current' }, state => states.push(state));
    await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1).status).toBe('error'); expect(states.at(-1).players).toEqual([]); stop();
  });
  it('explains missing team assignment instead of presenting an empty or ranked roster', async () => {
    harness.request.mockRejectedValue({ code: 'functions/failed-precondition' }); const states: any[] = [];
    const stop = loadTeamStandings({ playerId: 'You' }, state => states.push(state)); await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1)).toEqual({ status: 'error', players: [], error: 'Ask your coach to check your team assignment, then try again.' }); stop();
  });
  it('times out truthfully, ignores the late result, and allows a fresh retry', async () => {
    const response = deferred(); harness.request.mockReturnValueOnce(response.promise);
    const states: any[] = [], stop = loadTeamStandings({ playerId: 'You' }, state => states.push(state));
    await vi.advanceTimersByTimeAsync(20000); expect(states.at(-1).status).toBe('error');
    response.resolve({ data: { playerId: 'You', athletes: [player('Late', [])] } }); await response.promise; await Promise.resolve();
    expect(states.at(-1).players).toEqual([]); stop();
    harness.request.mockResolvedValueOnce({ data: { playerId: 'You', athletes: [player('Current', [])] } });
    const retryStop = loadTeamStandings({ playerId: 'You' }, state => states.push(state)); await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1).status).toBe('ready'); expect(states.at(-1).players[0].id).toBe('Current'); retryStop();
  });
  it('clears results on rejection and never requests a team for a signed-out account', async () => {
    harness.request.mockRejectedValue(new Error('Transport unavailable')); const states: any[] = [];
    const stop = loadTeamStandings({ playerId: 'You' }, state => states.push(state)); await Promise.resolve(); await Promise.resolve();
    expect(states.at(-1).status).toBe('error'); expect(states.at(-1).players).toEqual([]); stop();
    harness.uid = ''; harness.request.mockClear(); loadTeamStandings({ playerId: 'You' }, state => states.push(state));
    expect(states.at(-1).error).toContain('Sign in again'); expect(harness.request).not.toHaveBeenCalled();
  });
});
