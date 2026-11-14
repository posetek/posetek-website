import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player' } }, db: {}, cloud: {}, storage: {} }));
import type { Row } from './execution';
import { executable, executionPlan, freshStandaloneWorkout, freshWorkout, initialLog, patchBlock, resumeWorkout, standaloneWorkoutIsReady } from './execution';
import { newClock, elapsed, pauseClock, resumeClock, restSeconds, reconcileClock, interactClock, IDLE_MS } from './clock';
import { playerProfile, intakeSnapshot, comparisons, profileCell } from './scoring';
import { playerStandings } from './PlayerLeaderboards';
import { weekProgress } from './progress';
import { capabilityEnabled, parseFrame, streamCoach, validHandoff } from './gateway';
import { previewProgram } from './PlayerTraining';
import { playerRoute } from './PlayerExperience';
import { playerSearch } from './workspace';
import PlayerExperience from './PlayerExperience';
import { previewData } from '../lib/preview';

const plan = (): Row => ({ ...previewProgram(), id: 'p', startDate: '2026-09-07', timezone: 'America/Los_Angeles' });
const workout = () => executable(plan(), plan().weeks[0].workouts[0], 1);
afterEach(() => { vi.unstubAllGlobals(); });

describe('mobile execution contract', () => {
  it('uses namespaced v2 log IDs and pins the executable snapshot', () => {
    const w = workout(), l = initialLog(w, new Date());
    expect(w.id).toBe('p_w1s1'); expect(l.schemaVersion).toBe(2); expect(l.workoutSnapshot.blocks).toEqual(w.blocks);
  });
  it('requires review after a prescription revision and preserves an already started snapshot', () => {
    const w = workout(), edited = plan(); edited.weeks[0].workouts[0].revision = 2;
    expect(() => freshWorkout(edited, w)).toThrow('changed');
    const log = { ...initialLog(w, new Date()), id: w.id };
    const later = { ...w, blocks: [], workoutRevision: 2 };
    expect(resumeWorkout(later, log).blocks).toEqual(w.blocks);
    expect(resumeWorkout(later, log).workoutRevision).toBe(1);
  });
  it('does not reopen a finished session or start from an inactive plan', () => {
    expect(() => resumeWorkout(workout(), { ...initialLog(workout(), 0), endedAt: new Date() })).toThrow('ended');
    expect(() => freshWorkout({ ...plan(), status: 'superseded' }, workout())).toThrow('active');
  });
  it('rejects stale ad-hoc weeks and accepts a current ready workout', () => {
    const p = plan(), a = { ...p.weeks[0].workouts[0], id: 'adhoc', workoutId: 'adhoc', weekNumber: 1, planId: p.id, status: 'ready' };
    const w = executable(p, a, 1, 'adhoc');
    expect(freshWorkout(p, w, a, new Date('2026-09-10T12:00:00Z')).id).toBe('adhoc');
    expect(() => freshWorkout(p, w, a, new Date('2026-09-20T12:00:00Z'))).toThrow('no longer ready');
  });
  it('runs a workout built with no plan under the standalone namespace, by its own window', () => {
    const saved = { ...plan().weeks[0].workouts[0], id: 'draft_1', workoutId: 'draft_1', weekNumber: 1, planId: 'standalone', playerId: 'player-doc', source: 'adhoc', status: 'ready',
      standalone: { startDate: '2026-11-09', timezone: 'America/Los_Angeles', intake: { equipment: ['ball'] } }, windowStart: '2026-11-09T00:00:00-08:00', windowEnd: '2026-11-16T00:00:00-08:00' };
    expect(executionPlan(null, saved)).toEqual({ id: 'standalone' });
    expect(() => executionPlan(null, { planId: 'p' })).toThrow('training plan');
    const w = executable(executionPlan(null, saved), saved, 1, 'adhoc'), inside = new Date('2026-11-12T18:00:00Z');
    expect([w.id, w.planId, w.source, w.workoutId]).toEqual(['draft_1', 'standalone', 'adhoc', 'draft_1']);
    expect(initialLog(w, 0)).toMatchObject({ schemaVersion: 2, planId: 'standalone', source: 'adhoc', workoutId: 'draft_1', workoutRevision: 1 });
    expect(freshStandaloneWorkout('player-doc', w, saved, inside).id).toBe('draft_1');
    expect(standaloneWorkoutIsReady(saved, 'player-doc', inside)).toBe(true);
    for (const stale of [{ ...saved, playerId: 'other' }, { ...saved, status: 'superseded' }, { ...saved, source: 'plan' }, { ...saved, standalone: undefined }, { ...saved, windowEnd: 'soon' }])
      expect(() => freshStandaloneWorkout('player-doc', w, stale, inside)).toThrow('no longer ready');
    expect(() => freshStandaloneWorkout('player-doc', w, saved, new Date('2026-11-16T08:00:00Z'))).toThrow('no longer ready');
    expect(() => freshStandaloneWorkout('player-doc', w, { ...saved, revision: 2 }, inside)).toThrow('changed');
  });
  it('splices only the intended block and undo removes all evidence', () => {
    const w = workout(), old = { ...initialLog(w, 0), blocks: [{ blockId: 'b1', status: 'done' }, { blockId: 'b2', status: 'partial' }] };
    expect(patchBlock(old, 'b1', null)).toEqual([{ blockId: 'b2', status: 'partial' }]);
    expect(() => patchBlock(old, 'not-in-snapshot', null)).toThrow('not in');
  });
});

describe('clock matches mobile suspension and pause behavior', () => {
  it('caps an overnight gap at 30 minutes and requires explicit resume', () => {
    const c = newClock(1000), later = IDLE_MS * 20;
    expect(elapsed(c, later)).toBe(1800);
    expect(interactClock(c, later).runningSince).toBeNull();
    expect(elapsed(resumeClock(reconcileClock(c, later), later), later + 1000)).toBe(1801);
  });
  it('freezes rest when paused and retains sub-second remainder', () => {
    const c = { ...newClock(1000), restUntil: 61000 };
    const paused = pauseClock(c, 15500);
    expect(restSeconds(paused, 90000)).toBe(46);
    const resumed = resumeClock(paused, 90000);
    expect(restSeconds(resumed, 90500)).toBe(45);
    expect(elapsed(resumed, 91000)).toBe(15.5);
  });
});

describe('profile and leaderboard parity', () => {
  it('does not rank a speed-only sprint and ranks fastest completion first', () => {
    const players = [{ id: 'speed-only', reps: [{ repType: 'sprint', max_velocity: 20 }] }, { id: 'slow', reps: [{ repType: 'sprint', totalTime: 4, courseDistanceMeters: 20 }] }, { id: 'fast', reps: [{ repType: 'sprint', totalTime: 2, courseDistanceMeters: 20 }] }];
    expect(playerStandings(players, 'sprint').map(p => p.id)).toEqual(['fast', 'slow']);
    expect(playerProfile(players[0].reps).overall).toBeNull();
  });
  it('keeps unavailable profile scores unscored and shares ties on measured tests', () => {
    const reps = [{ repType: 'sprint', totalTime: 2, courseDistanceMeters: 20, max_velocity: 7, max_acceleration: 4 }];
    const rows = playerStandings([{ id: 'a', reps }, { id: 'b', reps }], 'sprint');
    expect(rows.map(r => r.rank)).toEqual([1, 1]); expect(rows[0].value).toBe(2);
    expect(playerStandings([{ id: 'a', reps }], 'overall')).toEqual([]);
    expect(playerProfile([]).metrics.every(m => m.best === null)).toBe(true);
  });
  it('matches courses within five percent, caps slowdown penalty and never mixes distances', () => {
    const reps = [{ id: 'd', repType: 'dribbling', totalTime: 6, markerDistance: 10, dribble_foot: 'right' }, { id: 'l', repType: 'dribbling', totalTime: 8, markerDistance: 10.4, dribble_foot: 'left' }, { id: 'c', repType: 'changeOfDirection', totalTime: 4, markerDistance: 10.4 }];
    const c = comparisons(reps); expect(c.dribbleRetention).toBe(75); expect(c.slowdown).toBe(50); expect(c.multiplier).toBeCloseTo(.8 + .2 * 4 / 6);
    expect(comparisons(reps.map(r => r.id === 'c' ? { ...r, markerDistance: 12 } : r)).multiplier).toBe(1);
  });
  it('uses age/gender dataset cells and supplies primary metrics to intake', () => {
    expect(profileCell({ age: 15, gender: 'female' })).toBe('u16|female');
    const p = playerProfile([{ repType: 'deadballShot', velocity: 25 }]);
    const s = intakeSnapshot(p);
    expect(s.drills[0].drill).toBe('kick'); expect(s.drills[0].metrics[0].bestCanonical).toBe(25);
    expect(playerProfile([{ repType: 'jump', jumpHeight: .4 }], {}, { cells: {} }).overall).toBeNull();
  });
});

describe('v3 weekly evidence', () => {
  it('counts one exposure per domain per workout and half minutes for partial work', () => {
    const p = plan(), w = workout(), l = { ...initialLog(w, new Date('2026-09-08T12:00:00Z')), id: w.id, blocks: [{ blockId: 'b1', drillId: 'a', domain: 'dribbling', status: 'done', estimatedMinutes: 9 }, { blockId: 'b2', drillId: 'b', domain: 'dribbling', status: 'partial', estimatedMinutes: 9 }] };
    const progress = weekProgress(p, p.weeks[0], [l, l], [], []);
    expect(progress.domains.find(d => d.domain === 'dribbling')?.done).toBe(1); expect(progress.minutes).toBe(13);
  });
  it('deduplicates app recordings linked to a logged workout while counting free sessions', () => {
    const p = plan(), w = workout(), l = { ...initialLog(w, 0), id: w.id, linkedTrainingSessionId: 'linked', blocks: [{ blockId: 'b1', domain: 'dribbling', status: 'done', estimatedMinutes: 5 }] };
    const reps = [1, 2, 3].map((n) => ({ id: `r${n}`, repType: 'dribbling', sessionNumber: n === 3 ? 2 : 1, createdAtMillis: new Date('2026-09-08T12:00:00Z').getTime() }));
    const progress = weekProgress(p, p.weeks[0], [l], reps, [{ id: 'linked', sessionRefs: [{ drillType: 'dribbling', sessionNumber: 1, sessionDocId: 's1' }] }]);
    expect(progress.domains.find(d => d.domain === 'dribbling')?.done).toBe(2);
  });
  it('ignores wrong-plan, forged log IDs, skipped work and ad-hoc work outside the calendar week', () => {
    const p = plan(), w = workout(), base = { ...initialLog(w, new Date('2026-09-25T12:00:00Z')), id: w.id, blocks: [{ status: 'done', domain: 'dribbling', estimatedMinutes: 50 }] };
    const progress = weekProgress(p, p.weeks[0], [{ ...base, planId: 'other' }, { ...base, id: 'wrong' }, { ...base, id: 'adhoc', source: 'adhoc' }], [], []);
    expect(progress.minutes).toBe(0); expect(progress.domains.every(d => !d.done)).toBe(true);
  });
});

describe('gateway terminal state and feature gates', () => {
  it('uses globalEnabled and preserves legacy default capability behavior', () => {
    expect(capabilityEnabled(null, 'pose_chat')).toBe(false);
    expect(capabilityEnabled({}, 'pose_chat')).toBe(true);
    expect(capabilityEnabled({ globalEnabled: false }, 'pose_chat')).toBe(false);
    for (const quota of [0, true, '3', -1, 1.5]) expect(capabilityEnabled({ capabilities: { workout_chat: { enabled: true, dailyLimitPerUser: quota } } }, 'workout_chat')).toBe(false);
    expect(capabilityEnabled({ capabilities: { workout_chat: { enabled: true, dailyLimitPerUser: 3 } } }, 'workout_chat')).toBe(true);
  });
  it('parses multiline SSE and ignores heartbeat comments', () => {
    expect(parseFrame(': heartbeat')).toBeNull();
    expect(parseFrame('event: delta\r\ndata: {\r\ndata: "text":"hello"}')).toEqual({ event: 'delta', data: { text: 'hello' } });
  });
  it('rejects an unterminated response and a terminal error after a draft', async () => {
    const firebase = await import('../../../lib/firebase'); (firebase.auth.currentUser as any).getIdToken = async () => 'test-token';
    for (const ending of ['', 'event: error\ndata: {"message":"failed"}\n\n']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('event: draft\ndata: {"draftId":"draft"}\n\n' + ending)));
      await expect(streamCoach({ playerId: 'p' }, new AbortController().signal, () => {})).rejects.toThrow();
    }
  });
  it('completes only on done and accepts handoffs for this player only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('event: done\ndata: {"messageId":"m"}\n\n')));
    await expect(streamCoach({ playerId: 'p' }, new AbortController().signal, () => {})).resolves.toBeUndefined();
    expect(validHandoff({ type: 'workout_request', playerId: 'p', request: '20 minutes', destination: 'workout_builder' }, 'p')).toBe(true);
    expect(validHandoff({ type: 'workout_request', playerId: 'other', request: '20 minutes', destination: 'workout_builder' }, 'p')).toBe(false);
  });
});

describe('player route and preview rendering', () => {
  it('opens the four workspace destinations and their pages', () => {
    // A player lands on the profile: the testing report on Stats.
    expect(playerRoute('')).toMatchObject({ view: 'stats', screen: null });
    expect(playerRoute('?player=p1&userType=player').view).toBe('stats');
    expect(playerRoute('?view=home').view).toBe('home');
    expect(playerRoute('?view=coach').view).toBe('coach');
    expect(playerRoute('?view=stats').view).toBe('stats');
    expect(playerRoute('?view=stats&screen=plan')).toMatchObject({ view: 'stats', screen: 'plan' });
    for (const screen of ['plan', 'saved', 'history', 'tests']) expect(playerRoute(`?view=workouts&screen=${screen}`)).toMatchObject({ view: 'workouts', screen });
    // The workout hub is the Workouts root, so links to the retired hub page and carousel page open it.
    for (const retired of ['screen=workout', 'page=activities']) expect(playerRoute(`?view=workouts&${retired}`)).toMatchObject({ view: 'workouts', screen: null });
    expect(playerRoute('?view=workouts&screen=unknown').screen).toBeNull();
    expect(playerRoute('?view=home&screen=workout').screen).toBeNull();
  });
  it('keeps links saved before the four tabs meaningful', () => {
    expect(playerRoute('?view=profile').view).toBe('stats');
    expect(playerRoute('?view=aiCoach').view).toBe('coach');
    expect(playerRoute('?view=feed').view).toBe('home');
    expect(playerRoute('?view=leaderboards').view).toBe('home');
    // Report and notification links open the workout hub, as the app's report link does.
    expect(playerRoute('?player=p1&userType=player&view=training')).toMatchObject({ view: 'workouts', screen: null });
    expect(playerRoute('?view=training&screen=saved').screen).toBeNull();
    expect(playerRoute('?drill=sprint&session=session3&rep=r2')).toMatchObject({ view: 'workouts', screen: 'test', drill: 'sprint', session: 'session3', rep: 'r2' });
    expect(playerRoute('?view=drills')).toMatchObject({ view: 'workouts', screen: 'test', drill: 'shooting' });
  });
  it('writes one canonical query per destination and keeps unrelated parameters', () => {
    expect(playerSearch('?preview=1&view=training&session=s1', 'workouts', { screen: 'tests' })).toBe('preview=1&view=workouts&screen=tests');
    expect(playerSearch('?preview=1&view=workouts&screen=workout&page=activities', 'workouts')).toBe('preview=1&view=workouts');
    expect(playerSearch('?preview=1', 'workouts', { drill: 'sprint', session: 'session3', rep: 'r2' })).toBe('preview=1&view=workouts&drill=sprint&session=session3&rep=r2');
    expect(playerSearch('?view=workouts&screen=plan', 'stats')).toBe('view=stats');
  });
  it.each(['home', 'coach', 'workouts', 'stats', 'aiCoach', 'training', 'leaderboards', 'drills'])('renders %s with the four workspace tabs and no staff controls', view => {
    const data = previewData();
    const ctx = { ...data, notify: () => {}, allStatsReps: () => Object.values(data.reps).flat() };
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/athlete?preview=1&view=${view}`]}><PlayerExperience ctx={ctx} initialReps={data.reps} /></MemoryRouter>);
    expect(html).toContain('Player tabs'); expect(html).not.toContain('Coach view'); expect(html).toContain('no account changes');
    const navigation = html.match(/<nav class="player-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || '';
    expect((navigation.match(/<a /g) || []).length).toBe(4);
    for (const label of ['Home', 'Coach', 'Workouts', 'Stats']) expect(navigation).toContain(`>${label}</span>`);
    for (const removed of ['Profile', 'Results', 'Leaderboards', 'Community']) expect(navigation).not.toContain(removed);
    expect(navigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('Open community feed');
    // An older training link opens the workout hub, which is the Workouts root: the plan summary, then Create a workout.
    if (view === 'training' || view === 'workouts') { expect(html).toContain('<h1>Workouts</h1>'); expect(html).toContain('MY WORKOUT PLAN'); expect(html).toContain('Build Workout'); }
    // The six tests are a page of their own now; an older results link still opens a test.
    if (view === 'workouts') expect(html).not.toContain('<strong>Shooting</strong>');
    // Stats carries neither the lifetime training totals nor the drills from the plan (Nolan, 2026-11-12).
    if (view === 'stats') for (const gone of ['Training totals', 'rills to try', 'Clear, flat space']) expect(html).not.toContain(gone);
    if (view === 'stats') {
      // The profile: the skill radar first, the testing report beneath it, then the next steps.
      const order = ['>Skill benchmarks</h2>', 'class="stats-report"', '>So what do I do with these results?</h2>'].map(heading => html.indexOf(heading));
      expect(order.every(index => index >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(html).not.toContain('>Body scan</h2>');
      expect(html).not.toContain('Overall rating');
      expect(html).not.toContain('Leaderboards');
    }
    if (view === 'home') { expect(html).toContain('Your week'); expect(html).toContain('>Organization activity</h2>'); }
  });
});
