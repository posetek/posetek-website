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

function detail(reps: Row[]) {
  return renderToStaticMarkup(<TestPosePlayer metric={left} report={{ ...DEMO_REPORT, testDateMillis: day }}
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

  it('shows only the reported score when the matching capture or its current review is unavailable', () => {
    const markup = detail([rightRep, { ...leftRep, resultStatus: { ...leftRep.resultStatus, revisionId: 'superseded' } }]);
    expect(markup).toContain('Replay unavailable for this result.');
    expect(markup).toContain('6.56 s');
    expect(markup).not.toMatch(/6\.72 s|Team avg|All attempts/);
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
