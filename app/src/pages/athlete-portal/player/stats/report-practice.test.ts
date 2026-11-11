import { describe, expect, it } from 'vitest';
import { activeTrainingPlan, catalogEntry, practiceCandidateIds, readPlan, readPracticeCatalog, reportPracticeSamples } from './report-practice';
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
    expect(samples).toMatchObject([{ id: 'A', name: 'Cone maze', reason: `${GENERAL} Carries into tight dribbling.` }]);
  });
  it('fills the one-pager card from the plan block and the catalog row, and leaves missing fields null', () => {
    const weeks = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [
      block('b1', 1, 'DRB-005', 'Cone maze', { domain: 'dribbling', sets: 3, reps: 60, repUnit: 'seconds', restSeconds: 30, restScope: 'sets', estimatedMinutes: 14 }),
      block('b2', 2, 'SPD-001', 'Bounds', { sets: 2, reps: 5, perSide: true }),
    ] }] }];
    const catalog = [
      catalogEntry('DRB-005', { schemaVersion: 2, status: 'published', domain: 'dribbling', equipment: ['ball', 'cones'],
        howTo: { setup: 'Set a cone line.', steps: ['Weave through the cones.', 'Keep the ball close.'] }, technicalTransfer: 'Carries into tight dribbling.' }),
      catalogEntry('SPD-001', { schemaVersion: 2, status: 'published', equipment: [], howTo: { setup: '', steps: [] } }),
    ];
    expect(reportPracticeSamples(plan(weeks), 'p1', catalog)).toEqual([
      { id: 'DRB-005', name: 'Cone maze', reason: `${GENERAL} Carries into tight dribbling.`, tag: 'Dribbling', dose: '3 x 60 s · 30s rest · ~14 min',
        instruction: 'Weave through the cones. Keep the ball close.', equipment: 'Football, Cones' },
      { id: 'SPD-001', name: 'Bounds', reason: GENERAL, tag: null, dose: '2 x 5 reps each side', instruction: null, equipment: null },
    ]);
    // An older catalog row without steps falls back to its setup; the catalog focus fills a block without one.
    const legacy = catalogEntry('PAS-001', { status: 'published', domain: 'passingReceiving', setup: 'Stand five metres from a wall.', equipment: ['wall', 'unknownThing'] });
    const [sample] = reportPracticeSamples(plan([{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: [block('b', 1, 'PAS-001', 'Wall pass')] }] }]), 'p1', [legacy]);
    expect(sample).toMatchObject({ tag: 'Passing', instruction: 'Stand five metres from a wall.', equipment: 'Wall for rebound passes, unknownThing', dose: '3 x 10 reps' });
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
  it('reads catalog rows only until two drills qualify, with the same samples as the full catalog', async () => {
    const weeks = [
      { weekNumber: 2, workouts: [{ workoutId: 'w3', order: 1, blocks: [block('b1', 1, 'G', 'Never reached')] }], drills: [{ drillId: 'H', name: 'Week drill', sets: 2, reps: 5 }] },
      { weekNumber: 1, workouts: [
        { workoutId: 'w2', order: 2, blocks: [block('b1', 1, 'E', 'Unpublished late'), block('b2', 2, 'F', 'Second shown'), block('b3', 3, 'A', 'Missing again')] },
        { workoutId: 'w1', order: 1, blocks: [
          block('b1', 1, 'A', 'Missing from catalog'), block('b2', 2, 'B', 'Draft'), block('b3', 3, 'C', 'No sets', { sets: 0 }),
          block('b4', 4, 'X', 'Read fails'), block('b5', 5, 'D', 'First shown'), block('b6', 6, 'D', 'Duplicate'),
        ] },
      ] },
    ];
    const full: PracticeCatalogEntry[] = [
      { drillId: 'B', published: false, technicalTransfer: '' }, { drillId: 'C', published: true, technicalTransfer: '' },
      { drillId: 'X', published: true, technicalTransfer: '' }, { drillId: 'D', published: true, technicalTransfer: 'Note D.' },
      { drillId: 'E', published: false, technicalTransfer: '' }, { drillId: 'F', published: true, technicalTransfer: '' },
      { drillId: 'G', published: true, technicalTransfer: '' }, { drillId: 'H', published: true, technicalTransfer: '' },
    ];
    const reads: string[] = [];
    const read = (id: string) => { reads.push(id); return id === 'X' ? Promise.reject(new Error('offline')) : Promise.resolve(full.find(entry => entry.drillId === id) ?? null); };
    // A failed read is treated like a missing row, so the full path must not know X either.
    const fullWithoutX = full.filter(entry => entry.drillId !== 'X');
    const lazy = reportPracticeSamples(plan(weeks), 'p1', await readPracticeCatalog(plan(weeks), 'p1', read));
    expect(lazy).toEqual(reportPracticeSamples(plan(weeks), 'p1', fullWithoutX));
    expect(lazy.map(sample => sample.name)).toEqual(['First shown', 'Second shown']);
    expect(reads).toEqual(['A', 'B', 'X', 'D', 'E', 'F']);
  });
  it('matches the full catalog on every plan shape and never reads past the second qualifying drill', async () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
    // Every combination of published / unpublished / missing for six drills (3^6 catalogs).
    for (let code = 0; code < 3 ** ids.length; code += 1) {
      const catalog: PracticeCatalogEntry[] = [];
      ids.forEach((id, index) => { const state = Math.floor(code / 3 ** index) % 3; if (state < 2) catalog.push({ drillId: id, published: state === 0, technicalTransfer: `t${id}` }); });
      const weeks = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: ids.map((id, index) => block(`b${index}`, index, id, `Drill ${id}`)) }] }];
      const reads: string[] = [];
      const entries = await readPracticeCatalog(plan(weeks), 'p1', id => { reads.push(id); return Promise.resolve(catalog.find(entry => entry.drillId === id) ?? null); });
      const lazy = reportPracticeSamples(plan(weeks), 'p1', entries), full = reportPracticeSamples(plan(weeks), 'p1', catalog);
      expect(lazy).toEqual(full);
      const lastShown = full.length === 2 ? ids.indexOf(full[1].id) : ids.length - 1;
      // Exactly the drills up to the second one shown (all of them when fewer than two qualify).
      expect(reads).toEqual(ids.slice(0, lastShown + 1));
    }
    const first = [{ weekNumber: 1, workouts: [{ workoutId: 'w', blocks: ids.map((id, index) => block(`b${index}`, index, id, `Drill ${id}`)) }] }];
    const reads: string[] = [];
    await readPracticeCatalog(plan(first), 'p1', id => { reads.push(id); return Promise.resolve({ drillId: id, published: true, technicalTransfer: '' }); });
    expect(reads).toEqual(['A', 'B']);
    expect(await readPracticeCatalog(plan(first), 'other', () => { throw new Error('must not read'); })).toEqual([]);
  });
  it('resolves the catalog status as the app does', () => {
    expect(catalogEntry('A', { status: 'published', technicalTransfer: 'x' })).toEqual({ drillId: 'A', published: true, technicalTransfer: 'x', domain: '', instruction: null, equipment: [] });
    expect(catalogEntry('A', { status: 'draft', dose: { setsMax: 3 } }).published).toBe(false);
    expect(catalogEntry('A', { dose: { setsMax: 3 } }).published).toBe(true);
    expect(catalogEntry('A', { dose: { doseText: '3 x 10' } }).published).toBe(true);
    expect(catalogEntry('A', {}).published).toBe(false);
    expect(catalogEntry('A', { status: 'weird' }).published).toBe(false);
  });
});
