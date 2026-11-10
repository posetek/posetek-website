import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDevelopment, teamAverageText } from '../app/private-report/render.mjs';
import { pathwayFixture } from './fixtures/private-parent-pathway.mjs';
const fixture = () => ({version: 1, charts: pathwayFixture(), positionStatus: 'general', positionLabel: 'General development', positionNote: 'Position is not recorded.', strengths: [{title: 'Recorded sprint', text: 'Strongest recorded area, not an above-average claim.', basis: 'recorded', drillIds: []}], priorities: [{title: 'General movement', text: 'General practice, not a measured weakness.', basis: 'position', drillIds: []}], plan: {id: 'saved-plan', summary: 'Four saved sessions.', schedule: 'Future dates.', progression: 'Follow the saved second-week doses.', assumptions: 'Two practices and a weekend match.'}});
const drills = () => [1,2].map(n => ({drillId: `drill-${n}`, workoutId: 'workout-1', planId: 'saved-plan', equipment: 'cones', why: 'Practise controlled movement.'}));
test('optional development leaves legacy payloads compatible and binds two drills to the saved plan', () => {
  assert.equal(validateDevelopment(undefined, undefined), false);
  assert.equal(validateDevelopment(fixture(), drills()), true);
  const mismatch=drills(); mismatch[0].planId='another-plan';
  assert.throws(() => validateDevelopment(fixture(), mismatch), /disagree/);
  assert.throws(() => validateDevelopment(fixture(), drills().slice(0,1)), /Two saved-plan/);
});
test('unknown positions, unavailable specialist drills and withheld results remain explicit', () => {
  for (const status of ['general','verified','conflict']) {
    const d=fixture(); d.positionStatus=status;
    if(status==='verified') {d.positionLabel='Goalkeeper';d.positionNote='General movement; no eligible specialist drill is available.';}
    d.charts[0].athlete={ageGroup:13,value:null,percentile:null,placementStatus:'no-valid-result'};
    assert(validateDevelopment(d,drills()));
    d.charts[0].athlete.value=0;
    assert.throws(() => validateDevelopment(d,drills()), /Unqualified result/);
  }
});
test('invalid references and unsupported recommendation fields fail closed', () => {
  for (const mutate of [d=>d.version=2,d=>d.positionStatus='guessed',d=>d.priorities[0].basis='diagnosis',d=>d.priorities.push(d.priorities[0],d.priorities[0]),d=>d.plan=null,d=>d.charts[0].groups[3].n=1]) {
    const d=fixture();mutate(d);assert.throws(() => validateDevelopment(d,drills()));
  }
});

test('focused findings require saved-plan references but not age charts or a plan summary', () => {
  const d=fixture();delete d.charts;d.plan={id:'saved-plan'};
  assert(validateDevelopment(d,drills(),true));
  assert.throws(()=>validateDevelopment(d,drills()));
  d.plan.id='other';assert.throws(()=>validateDevelopment(d,drills(),true),/disagree/);
});
test('inline team averages are independent of the player result and suppress sparse groups', () => {
  assert.equal(teamAverageText({result:null,average:'7.32 s',count:11}),'Team average: 7.32 s · 11 results');
  assert.equal(teamAverageText({average:'7.32 s',count:4}),'Team average unavailable · 4 usable results (5 needed)');
  assert.equal(teamAverageText({average:null,count:0}),'Team average unavailable · 0 usable results (5 needed)');
});
