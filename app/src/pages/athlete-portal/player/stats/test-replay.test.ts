import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleteTestReport, ReportMetric } from '../report';

// The rep files, the cache and the team's records are stubbed: only which replays are asked for matters.
const loadRepReplay = vi.hoisted(() => vi.fn(async () => ({ frames: [], metadata: {}, tracking: null, artifactUrls: {}, mediaUrl: null })));
const loadTeamComparison = vi.hoisted(() => vi.fn(async (metric: { id: string }) => ({ median: { playerId: 'teammate', rep: { id: `median-${metric.id}` }, value: 1 }, averages: {}, count: 8 })));
vi.mock('../../views/SessionView', () => ({ loadRepReplay }));
vi.mock('../../lib/warm-rep-files', () => ({ warmRepFiles: vi.fn(async () => {}) }));
vi.mock('../../lib/replay-cache', () => ({ remember: (_key: string, load: () => unknown) => load() }));
vi.mock('./test-comparison', async original => ({ ...(await original<typeof import('./test-comparison')>()), loadTeamComparison }));

const { teamShadow, warmStatsReplays } = await import('./test-replay');

const metric = (id: string, result: string): ReportMetric => ({ id, label: id, status: 'measured', result, percentile: 50, band: 'middle', count: 8, estimatedCount: 0, average: result, recordedAtMillis: null });
const day = Date.UTC(2026, 10, 9, 12);
const createdAt = { seconds: day / 1000, nanoseconds: 0 };

describe('warming the Stats replays', () => {
  beforeEach(() => { loadRepReplay.mockClear(); loadTeamComparison.mockClear(); });

  it('loads the team median\'s replay for the runs only: the jumps draw a reference line instead', async () => {
    expect(['jump', 'broadJump'].map(teamShadow)).toEqual([false, false]);
    expect(['sprint', 'dribbling', 'changeOfDirection'].map(teamShadow)).toEqual([true, true, true]);
    const report: AthleteTestReport = { kind: 'event', playerId: 'athlete', testDateMillis: day, teamName: 'Team', metrics: [
      metric('jump', '17.6 cm'), metric('broadJump', '1.20 m'), metric('sprint', '2.07 s'),
    ] };
    const reps = {
      jump: [{ id: 'own-jump', jumpHeight: .176, createdAt }],
      broadJump: [{ id: 'own-broad', broadJumpDistance: 1.2, createdAt }],
      sprint: [{ id: 'own-sprint', totalTime: 2.07, createdAt }],
    };
    await warmStatsReplays(report, reps, { organizationId: 'org', teamId: 'team' }, 'admin', 'athlete');
    const loaded = loadRepReplay.mock.calls.map(call => `${(call as unknown[])[3]}:${((call as unknown[])[1] as { id: string }).id}`);
    expect(loaded).toEqual(expect.arrayContaining(['athlete:own-jump', 'athlete:own-broad', 'athlete:own-sprint', 'teammate:median-sprint']));
    expect(loaded).not.toContain('teammate:median-jump');
    expect(loaded).not.toContain('teammate:median-broadJump');
    // The team comparison itself still loads for every test: the table's other rows use its averages.
    expect(loadTeamComparison.mock.calls.map(call => (call[0] as { id: string }).id)).toEqual(['jump', 'broadJump', 'sprint']);
  });
});
