import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleteTestReport, ReportMetric } from '../report';

// The athlete's media loader is stubbed so an accidental teammate-media request fails the assertions.
const loadRepReplay = vi.hoisted(() => vi.fn(async () => ({ frames: [], metadata: {}, tracking: null, artifactUrls: {}, mediaUrl: null })));
// Staff replay warming also asks Storage for an optional marker file. Keep this
// fixture credential-free and deterministic when that optional file is absent.
vi.mock('../../../../lib/firebase', async original => ({
  ...(await original<typeof import('../../../../lib/firebase')>()),
  storage: { ref: () => ({ child: () => ({ getDownloadURL: async () => { throw new Error('Synthetic optional file absent'); } }) }) },
}));
vi.mock('../../views/SessionView', () => ({ loadRepReplay }));
vi.mock('../../lib/warm-rep-files', () => ({ warmRepFiles: vi.fn(async () => {}) }));
vi.mock('../../lib/replay-cache', () => ({ remember: (_key: string, load: () => unknown) => load() }));

const { drillByKey } = await import('../../lib/drills');
const { medianReplay, teamShadow, warmStatsReplays } = await import('./test-replay');

const metric = (id: string, result: string): ReportMetric => ({ id, label: id, status: 'measured', result, percentile: 50, band: 'middle', count: 8, estimatedCount: 0, average: result, recordedAtMillis: null });
const day = Date.UTC(2026, 10, 9, 12);
const createdAtMillis = day;

describe('warming the Stats replays', () => {
  beforeEach(() => { loadRepReplay.mockClear(); });

  it('only prefetches the athlete’s own replays', async () => {
    expect(['jump', 'broadJump'].map(teamShadow)).toEqual([false, false]);
    expect(['sprint', 'dribbling', 'changeOfDirection'].map(teamShadow)).toEqual([true, true, true]);
    const report: AthleteTestReport = { kind: 'event', playerId: 'athlete', testDateMillis: day, teamName: 'Team', metrics: [
      metric('jump', '17.6 cm'), metric('broadJump', '1.20 m'), metric('sprint', '2.07 s'),
    ] };
    const reps = {
      jump: [{ id: 'own-jump', jumpHeight: .176, createdAtMillis }],
      broadJump: [{ id: 'own-broad', broadJumpDistance: 1.2, createdAtMillis }],
      sprint: [{ id: 'own-sprint', totalTime: 2.07, createdAtMillis }],
    };
    await warmStatsReplays(report, reps, 'admin', 'athlete');
    const loaded = loadRepReplay.mock.calls.map(call => `${(call as unknown[])[3]}:${((call as unknown[])[1] as { id: string }).id}`);
    expect(loaded).toEqual(['athlete:own-jump', 'athlete:own-broad', 'athlete:own-sprint']);
  });

  it('builds a run shadow from the anonymous tracking payload alone and omits unavailable media', () => {
    const frames = Array.from({ length: 12 }, (_, index) => ({ index, person: { x: .1 + index * .01, y: .1, w: .2, h: .6 } }));
    const median = { status: 'measured' as const, rep: { startFrame: 3, endFrame: 8 }, artifacts: { 'tracking.json': { frames, fps: 30 } } };
    const shadow = medianReplay(drillByKey('sprint'), median);
    expect(shadow?.anchor).toBe(3);
    expect(shadow?.sequence.centerLine).toHaveLength(12);
    expect(medianReplay(drillByKey('jump'), median)).toBeNull();
    expect(medianReplay(drillByKey('dribbling'), { status: 'estimate', rep: {}, artifacts: {} })).toBeNull();
    expect(loadRepReplay).not.toHaveBeenCalled();
  });
  it.each([17, 33])('draws only the recorded joints of an anonymous %i-landmark run', count => {
    const leftHip = count === 17 ? 11 : 23, rightHip = leftHip + 1;
    const points = Array.from({ length: count }, (_, index) => index === leftHip ? [.2, .5] : index === rightHip ? [.3, .5] : null);
    const artifacts = { 'metadata.json': { fps: 30 }, 'pose.json': [points, points, points] };
    const shadow = medianReplay(drillByKey('dribbling'), { status: 'estimate', rep: { startFrame: 1 }, artifacts });
    expect(shadow?.sequence.frames[0][23]).toEqual([.2, .5]);
    expect(shadow?.sequence.frames[0][24]).toEqual([.3, .5]);
    expect(shadow?.sequence.frames[0][15]).toBeNull();
    expect(shadow?.anchor).toBe(1);
    expect(medianReplay(drillByKey('dribbling'), { status: 'estimate', rep: {}, artifacts: { ...artifacts, 'metadata.json': { poseComputed: false } } })).toBeNull();
    expect(loadRepReplay).not.toHaveBeenCalled();
  });
});
