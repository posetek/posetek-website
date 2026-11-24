import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_REPORT } from '../report';
import { SPLITS, comparisonRows, loadTeamComparison, shownSplitRow, splitRow, versusTeam } from './test-comparison';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/firebase', () => ({
  auth: { currentUser: { uid: 'athlete' } },
  cloud: { httpsCallable: (name: string) => (request: unknown) => invoke(name, request) },
}));
vi.mock('../../lib/replay-cache', () => ({ remember: (_: string, load: () => unknown) => load() }));

const split = (drill: string, label: string) => SPLITS[drill].find(item => item.label === label)!;

describe('the rep against the team, row by row', () => {
  it('records which way is better for every row', () => {
    const higher = Object.values(SPLITS).flat().filter(item => item.higher).map(item => item.label);
    expect([...new Set(higher)].sort()).toEqual(['Distance', 'Jump height', 'Max acceleration', 'Peak height', 'Top speed']);
    // Every time, and the dribble's ball distance (the ball kept closer), is better lower.
    expect(split('dribbling', 'Ball distance').higher).toBe(false);
    for (const label of ['Total time', 'Out', 'Turn', 'Back']) expect(split('changeOfDirection', label).higher).toBe(false);
  });

  it('a lower time is better and a higher one worse', () => {
    expect(versusTeam(1.93, 2.19, { digits: 2, higher: false })).toEqual({ standing: 'better', difference: -.26 });
    expect(versusTeam(2.12, 1.94, { digits: 2, higher: false })).toEqual({ standing: 'worse', difference: .18 });
  });

  it('a higher jump or speed is better and a lower one worse', () => {
    expect(versusTeam(9.5, 6.9, { digits: 1, higher: true }).standing).toBe('better');
    expect(versusTeam(6.9, 9.5, { digits: 1, higher: true })).toEqual({ standing: 'worse', difference: -2.6 });
  });

  it('is level when the shown figures match or are within about 1%', () => {
    // Different underneath, the same once shown to two decimals.
    expect(versusTeam(7.751, 7.749, { digits: 2, higher: false })).toEqual({ standing: 'level', difference: 0 });
    // 0.03 s on 7.78 s is 0.4%: level, though the difference is still shown.
    expect(versusTeam(7.75, 7.78, { digits: 2, higher: false })).toEqual({ standing: 'level', difference: -.03 });
    // 0.05 s on 3.65 s is 1.4%: worse.
    expect(versusTeam(3.70, 3.65, { digits: 2, higher: false }).standing).toBe('worse');
    // Exactly 1% is still level; just over it is not.
    expect(versusTeam(10.1, 10, { digits: 1, higher: true }).standing).toBe('level');
    expect(versusTeam(10.2, 10, { digits: 1, higher: true }).standing).toBe('better');
  });

  it('builds a row with the signed difference in the row\'s units, or a neutral row without a team value', () => {
    const ball = split('dribbling', 'Ball distance');
    expect(splitRow(ball, 34.6 / 39.3701, 33.2 / 39.3701)).toEqual({ label: 'Ball distance', mine: '34.6 in', average: '33.2 in', standing: 'worse', difference: '+1.4 in' });
    const turn = split('dribbling', 'Turn');
    expect(splitRow(turn, 1.93, 2.19)).toMatchObject({ standing: 'better', difference: '−0.26 s' });
    expect(splitRow(turn, 1.93, undefined)).toEqual({ label: 'Turn', mine: '1.93 s', average: null, standing: null, difference: null });
    expect(splitRow(turn, null, 2.19)).toMatchObject({ mine: null, average: '2.19 s', standing: null, difference: null });
  });

  it('compares the headline row with the report\'s own average in shown units', () => {
    const height = split('jump', 'Jump height');
    expect(shownSplitRow(height, '6.9 in', '9.5 in')).toEqual({ label: 'Jump height', mine: '6.9 in', average: '9.5 in', standing: 'worse', difference: '−2.6 in' });
    expect(shownSplitRow(split('changeOfDirection', 'Total time'), '7.75 s', '7.78 s')).toMatchObject({ average: '7.78 s', standing: 'level', difference: '−0.03 s' });
    // An average in a unit the row does not show is listed but not compared.
    expect(shownSplitRow(height, '6.9 in', '24.1 cm')).toMatchObject({ average: '24.1 cm', standing: null, difference: null });
  });
});

describe('the selected testing event comparison', () => {
  const report = { ...DEMO_REPORT, playerId: 'player' };
  const athlete = { organizationId: 'club', teamId: 'team' };
  const metric = { ...report.metrics[0], status: 'estimate' as const, recordedAtMillis: 2000 };
  const selectedResult = { result: metric.result, status: metric.status, recordedAtMillis: metric.recordedAtMillis };
  const response = { version: 1, playerId: 'player', metricId: metric.id, comparisonState: 'available', testDateMillis: report.testDateMillis,
    selectedResult, count: metric.count, averages: { totalTime: 7.2, phase1Time: 2, phase2Time: 2.6, phase3Time: 0, avgBallDistance: null },
    median: { status: 'estimate', rep: { startFrame: 2 }, artifacts: { 'tracking.json': { frames: [] } } } };
  beforeEach(() => invoke.mockReset());

  it('asks the authorized callable for one metric and takes only the returned usable averages and anonymous replay', async () => {
    invoke.mockResolvedValue({ data: response });
    const team = await loadTeamComparison(metric, report, athlete, 'player');
    expect(invoke.mock.calls).toEqual([['getAthleteTestComparison', { playerId: 'player', metricId: metric.id }]]);
    expect(team).toEqual({ averages: { totalTime: 7.2, phase1Time: 2, phase2Time: 2.6 }, median: response.median });
  });

  it('shows verified team splits for a saved score without a matching local replay or player splits', async () => {
    invoke.mockResolvedValue({ data: response });
    const team = await loadTeamComparison(metric, report, athlete, 'player');
    const rows = comparisonRows(metric, null, { phase1Time: 99 }, team, metric.average);
    expect(rows).toEqual([
      { label: 'Total time', mine: metric.result, average: metric.average, difference: '+0.42 s', standing: 'worse' },
      { label: 'Out', mine: null, average: '2.00 s', difference: null, standing: null },
      { label: 'Turn', mine: null, average: '2.60 s', difference: null, standing: null },
    ]);
    expect(comparisonRows(metric, { phase1Time: 1 }, {}, team, metric.average)).toEqual(rows);
    const measured = { ...metric, status: 'measured' as const };
    expect(comparisonRows(measured, null, {}, team, measured.average)).toEqual(rows);
  });

  it.each([
    { comparisonState: 'noComparableCohort' }, { comparisonState: 'historyLimit' }, { count: 4 }, { playerId: 'another-player' },
    { metricId: 'dribbleRight' }, { testDateMillis: report.testDateMillis + 1 }, { selectedResult: null },
    { selectedResult: { ...selectedResult, result: '7.60 s' } }, { selectedResult: { ...selectedResult, recordedAtMillis: 3000 } },
    { selectedResult: { ...selectedResult, status: 'measured' } }, { averages: { totalTime: 8 } }, { averages: {} },
  ])('drops a response that no longer matches the scorecard (%j)', async change => {
    invoke.mockResolvedValue({ data: { ...response, ...change } });
    expect(await loadTeamComparison(metric, report, athlete, 'player')).toBeNull();
  });

  it('skips ineligible reports before fetching a cohort', async () => {
    expect(await loadTeamComparison(metric, { ...report, kind: 'individual' }, athlete, 'player')).toBeNull();
    expect(await loadTeamComparison({ ...metric, count: 3 }, report, athlete, 'player')).toBeNull();
    expect(await loadTeamComparison({ ...metric, status: 'unavailable' }, report, athlete, 'player')).toBeNull();
    expect(await loadTeamComparison(metric, report, athlete, 'another-player')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
