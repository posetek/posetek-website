import { describe, expect, it } from 'vitest';
import { activeTrainingPlan, catalogEntry, practiceCandidateIds, readPlan, reportPracticeSamples } from './report-practice';
import type { PracticeCatalogEntry } from './report-practice';

const GENERAL = 'General practice from your saved plan, not a drill selected here to correct a measured weakness.';
const block = (blockId: string, order: number, drillId: string, name: string, extra: Record<string, unknown> = {}) => ({ blockId, order, drillId, name, sets: 3, reps: 10, ...extra });
const plan = (weeks: unknown[], extra: Record<string, unknown> = {}) => ({ playerId: 'p1', status: 'active', startDate: '2026-11-02', schemaVersion: 3, weeks, ...extra });
const published = (...ids: string[]): PracticeCatalogEntry[] => ids.map(id => ({ drillId: id, published: true, technicalTransfer: '' }));

describe('AthleteReportPractice.samples', () => {
  it('takes the first two eligible drills in week, workout and block order', () => {
    const weeks = [
      { weekNumber: 2, workouts: [{ workoutId: 'w3', order: 1, blocks: [block('b1', 1, 'LATE', 'Late drill')] }] },
      { weekNumber: 1, workouts: [
        { workoutId: 'w2', order: 2, blocks: [block('b1', 1, 'C', 'Third')] },
        { workoutId: 'w1', order: 1, blocks: [block('b2', 2, 'B', 'Second'), block('b1', 1, 'A', 'First')] },
      ] },
    ];
    expect(reportPracticeSamples(plan(weeks), 'p1', published('A', 'B', 'C', 'LATE')).map(sample => sample.name)).toEqual(['First', 'Second']);
  });
  it('appends the catalog transfer note to the fixed sentence', () => {
    const samples = reportPracticeSamples(plan([{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [block('b', 1, 'A', 'Cone maze')] }] }]), 'p1',
      [{ drillId: 'A', published: true, technicalTransfer: 'Carries into tight dribbling.' }]);
    expect(samples).toEqual([{ id: 'A', name: 'Cone maze', reason: `${GENERAL} Carries into tight dribbling.` }]);
  });
  it('skips duplicates, zero doses, blank names, unpublished and unknown drills, then reads week drills', () => {
    const weeks = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [
      block('b1', 1, 'A', 'Cone maze'), block('b2', 2, 'A', 'Cone maze again'), block('b3', 3, 'Z', 'No sets', { sets: 0 }),
      block('b4', 4, 'Y', '   '), block('b5', 5, 'D', 'Draft drill'), block('b6', 6, 'U', 'Unknown'),
    ] }], drills: [{ drillId: 'W', name: 'Week drill', sets: 2, reps: 8 }] }];
    const catalog = [...published('A', 'Z', 'Y', 'W'), { drillId: 'D', published: false, technicalTransfer: '' }];
    expect(reportPracticeSamples(plan(weeks), 'p1', catalog).map(sample => sample.id)).toEqual(['A', 'W']);
  });
  it('shows nothing for another athlete, an inactive plan, or a plan that needs start authorization', () => {
    const weeks = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [block('b', 1, 'A', 'Cone maze')] }] }];
    expect(reportPracticeSamples(plan(weeks), 'other', published('A'))).toEqual([]);
    expect(reportPracticeSamples(plan(weeks, { status: 'completed' }), 'p1', published('A'))).toEqual([]);
    expect(reportPracticeSamples(plan(weeks, { requiresTrainingStartAuthorization: true }), 'p1', published('A'))).toEqual([]);
    expect(reportPracticeSamples(null, 'p1', published('A'))).toEqual([]);
    expect(practiceCandidateIds(plan(weeks), 'other')).toEqual([]);
  });
  it('a V3 plan with a measured or unreadable workout is not read, as in the app', () => {
    expect(readPlan(plan([{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [block('b', 1, 'A', 'Cone maze', { isMeasuredDrill: true })] }] }]))).toBeNull();
    expect(readPlan(plan([{ weekNumber: 1, workouts: [{ blocks: [] }] }]))).toBeNull();
    // An older plan only drops the unreadable workout.
    expect(readPlan(plan([{ weekNumber: 1, workouts: [{ blocks: [] }] }], { schemaVersion: 2 }))?.weeks[0].workouts).toEqual([]);
    expect(readPlan(plan([], { schemaVersion: 4 }))).toBeNull();
  });
  it('lists the catalog rows to read and picks the newest active plan', () => {
    const weeks = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [block('b1', 1, 'A', 'One'), block('b2', 2, 'A', 'Again'), block('b3', 3, 'B', 'Two')] }] }];
    expect(practiceCandidateIds(plan(weeks), 'p1')).toEqual(['A', 'B']);
    const at = (ms: number) => ({ toMillis: () => ms });
    expect(activeTrainingPlan([{ id: 'old', status: 'active', generatedAt: at(1) }, { id: 'done', status: 'completed', generatedAt: at(9) }, { id: 'new', status: 'active', generatedAt: at(5) }])?.id).toBe('new');
    expect(activeTrainingPlan([{ id: 'done', status: 'completed' }])).toBeNull();
  });
  it('resolves the catalog status as the app does', () => {
    expect(catalogEntry('A', { status: 'published', technicalTransfer: 'x' })).toEqual({ drillId: 'A', published: true, technicalTransfer: 'x' });
    expect(catalogEntry('A', { status: 'draft', dose: { setsMax: 3 } }).published).toBe(false);
    expect(catalogEntry('A', { dose: { setsMax: 3 } }).published).toBe(true);
    expect(catalogEntry('A', { dose: { doseText: '3 x 10' } }).published).toBe(true);
    expect(catalogEntry('A', {}).published).toBe(false);
    expect(catalogEntry('A', { status: 'weird' }).published).toBe(false);
  });
});
