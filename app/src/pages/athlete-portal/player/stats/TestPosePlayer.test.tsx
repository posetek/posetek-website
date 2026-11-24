import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEMO_REPORT } from '../report';
import type { ReportMetric } from '../report';
import type { Row } from '../execution';
import TestPosePlayer from './TestPosePlayer';
import { bestRep } from './test-comparison';

const day = Date.UTC(2026, 0, 1);
const left: ReportMetric = { ...DEMO_REPORT.metrics[0], id: 'dribbleLeft', label: 'Left-course dribble', status: 'estimate',
  result: '6.56 s', recordedAtMillis: day + 10_000 };
const leftRep = { id: 'left-take', createdAtMillis: left.recordedAtMillis, totalTime: null,
  resultStatus: { qualified: false, duplicate: false, revisionId: 'review' },
  reviewedResult: { metric: 'totalTime', unit: 's', status: 'estimate', value: 6.56, protocolSide: 'left', revisionId: 'review' } };
const rightRep = { id: 'right-take', createdAtMillis: day + 40_000, gateStartSide: 'right', totalTime: 6.72006,
  resultStatus: { qualified: true, duplicate: false, revisionId: null } };

function detail(reps: Row[], metric: ReportMetric = left, kind: 'individual' | 'event' = 'event') {
  return renderToStaticMarkup(<TestPosePlayer metric={metric} report={{ ...DEMO_REPORT, kind, playerId: 'athlete', testDateMillis: day }}
    reps={{ dribbling: reps }} athlete={{}} access="athlete" playerId="athlete" onAllAttempts={() => {}} />);
}

describe('the dribble score card and its replay', () => {
  it('uses the reviewed left capture and its score when only the right capture has a qualified total time', () => {
    expect(bestRep(left, { dribbling: [rightRep, leftRep] }, day)).toBe(leftRep);
    const markup = detail([rightRep, leftRep]);
    expect(markup).toContain('Loading the replay');
    expect(markup).toContain('6.56 s');
    expect(markup).not.toContain('6.72 s');
  });

  it('compares the saved score and report average even when the matching replay is unavailable', () => {
    const markup = detail([rightRep, { ...leftRep, resultStatus: { ...leftRep.resultStatus, revisionId: 'superseded' } }]);
    expect(markup).toContain('Replay unavailable for this result.');
    expect(markup).toContain('6.56 s');
    expect(markup).toContain('Team avg');
    expect(markup).toContain('7.20 s');
    expect(markup).toContain('−0.64 s');
    expect(markup).not.toMatch(/6\.72 s|All attempts|role="rowheader">Turn/);
  });

  it('keeps team values out of personal, undersized and unavailable results', () => {
    expect(detail([], left, 'individual')).not.toContain('Team avg');
    expect(detail([], { ...left, count: 4 })).not.toContain('Team avg');
    expect(detail([], { ...left, result: null, status: 'retest' })).not.toContain('Team avg');
  });

  it('keeps an unrelated sprint out of the report even if its rounded time matches', () => {
    const sprint: ReportMetric = { ...left, id: 'sprint', status: 'measured' };
    const wrong = { id: 'earlier-event', createdAtMillis: day - 3600_000, totalTime: 6.56, maxVelocity: 5.7 };
    expect(bestRep(sprint, { sprint: [wrong] }, day)).toBeNull();
    const right = { ...wrong, id: 'this-event', createdAtMillis: left.recordedAtMillis };
    expect(bestRep(sprint, { sprint: [wrong, right] }, day)).toBe(right);
    expect(bestRep({ ...sprint, status: 'unavailable', result: null }, { sprint: [right] }, day)).toBeNull();
  });

  it('uses the report rounding at an exact half-step when a review changes the same recording', () => {
    const midpoint = { ...leftRep, reviewedResult: { ...leftRep.reviewedResult, value: 6.565 } };
    expect(bestRep(left, { dribbling: [midpoint] }, day)).toBeNull();
    expect(bestRep({ ...left, result: '6.57 s' }, { dribbling: [midpoint] }, day)).toBe(midpoint);
  });

  it('rejects reviewed units and sides that conflict with the retained result', () => {
    const inconsistent = (change: Row) => ({ ...leftRep, protocolSide: 'left', reviewedResult: { ...leftRep.reviewedResult, ...change } });
    expect(bestRep(left, { dribbling: [inconsistent({ protocolSide: 'right' })] }, day)).toBeNull();
    expect(bestRep(left, { dribbling: [inconsistent({ unit: 'm' })] }, day)).toBeNull();
  });

  it('uses the report capture timestamp to disambiguate equal measured times in older rows without protocolSide', () => {
    const measured = { ...left, status: 'measured' as const, result: '6.72 s' };
    const matching = { ...rightRep, id: 'left-measured', gateStartSide: 'left', createdAtMillis: left.recordedAtMillis };
    expect(bestRep(measured, { dribbling: [rightRep, matching] }, day)).toBe(matching);
    expect(bestRep(measured, { dribbling: [rightRep] }, day)).toBeNull();
    expect(bestRep({ ...measured, recordedAtMillis: null }, { dribbling: [rightRep, matching] }, day)).toBeNull();
    expect(bestRep(measured, { dribbling: [{ ...matching, protocolSide: 'right' }] }, day)).toBeNull();
    expect(bestRep(measured, { dribbling: [matching, { ...rightRep, createdAtMillis: matching.createdAtMillis }] }, day)).toBeNull();
  });
});
