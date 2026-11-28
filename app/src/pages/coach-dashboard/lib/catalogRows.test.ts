import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../lib/contracts/__fixtures__/workout-category-fixture.json';
import domainFile from '../../../lib/contracts/__fixtures__/workout-category-domains.json';
import { DEFAULT_WORKOUT_CATEGORIES, workoutCategoryGroups, workoutCategoryOf } from '../../../lib/contracts/workoutCategory';

const config = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../lib/firebase', () => ({ auth: {}, cloud: {}, db: { collection: (name: string) => ({ doc: (id: string) => ({
  get: () => config.get(`${name}/${id}`),
}) }) } }));
import { coachCatalogRows, loadWorkoutCategories } from './data';

const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
const heavy = {
  pools: { gym: { category: 'squat', secondary: [] } }, cameraView: 'Side', familyId: 'squat-family',
  profileVersion: 'core-movement-2', minimumClient: { build: 40 }, validation: { required: true, result: 'pending' },
  keyframes: [{ t: 0, joints: new Array(200).fill(0) }], accessRequirements: { sourceHash: 'abc' },
};

describe('coach drill picker catalog', () => {
  it('offers published drills only, so library drafts never reach a coach plan', () => {
    const rows = coachCatalogRows([
      doc('DRB-001', { name: 'Cone weave', domain: 'dribbling', status: 'published' }),
      doc('GYM-001', { name: 'Goblet squat', domain: 'strength', status: 'draft', ...heavy }),
      doc('OLD-001', { name: 'Retired', domain: 'strength', status: 'archived' }),
      doc('LEG-001', { name: 'No status', domain: 'shooting' }),
    ]);
    expect(rows.map(row => row.drillId)).toEqual(['DRB-001', 'LEG-001']);
  });

  it('keeps a published library drill and carries only the fields coaches read', () => {
    const [row] = coachCatalogRows([doc('GYM-002', {
      name: 'Plank', domain: 'strength', status: 'published', schemaVersion: 2, workoutCategory: 'gym',
      dose: { doseText: '3 sets x 30 s' }, estimatedMinutes: { min: 4, max: 6 }, cues: ['Brace'], execution: 'Hold.', ...heavy,
    })]);
    expect(row).toEqual({
      id: 'GYM-002', drillId: 'GYM-002', name: 'Plank', domain: 'strength', workoutCategory: 'gym', status: 'published', schemaVersion: 2,
      dose: { doseText: '3 sets x 30 s' }, estimatedMinutes: { min: 4, max: 6 }, cues: ['Brace'], execution: 'Hold.',
    });
    for (const key of Object.keys(heavy)) expect(row).not.toHaveProperty(key);
  });

  // The picker's chips for today's published catalog, before and after the backfill.
  const fixtureRows = Object.entries(fixture.rows as Record<string, { workoutCategory: string; status: string | null }>);
  const domains = domainFile.domains as Record<string, string>;
  const chips = (rows: any[]) => workoutCategoryGroups(rows, row => workoutCategoryOf(row.drillId, row)).map(g => `${g.label} ${g.count}`);
  // The v1 documents STR-001, STR-007 and VJP-008 store no status and count as published here
  // (the gateway archives VJP-008 by id), so Speed/agility shows 32 rather than the plan's 31.
  const today = ['Soccer 36', 'Speed/agility 32', 'Core 143', 'Strength 233', 'Mobility 3'];

  it('groups the published catalog by home category before the backfill', () => {
    const rows = coachCatalogRows(fixtureRows.map(([id, row]) => doc(id, { domain: domains[id], status: row.status })));
    expect(rows.every(row => !('workoutCategory' in row))).toBe(true);
    expect(chips(rows)).toEqual(today);
  });

  it('groups identically once every row stores workoutCategory', () => {
    const rows = coachCatalogRows(fixtureRows.map(([id, row]) => doc(id, { domain: domains[id], status: row.status, workoutCategory: row.workoutCategory })));
    expect(chips(rows)).toEqual(today);
  });
});

describe('picker category labels', () => {
  beforeEach(() => { config.get.mockReset(); });

  it('falls back to the compiled defaults when config/llm cannot be read, and retries later', async () => {
    config.get.mockRejectedValueOnce(new Error('permission-denied'));
    expect(await loadWorkoutCategories()).toBe(DEFAULT_WORKOUT_CATEGORIES);
    config.get.mockResolvedValueOnce({ data: () => ({ workoutCategories: { schemaVersion: 1, categories: [{ id: 'core', label: 'Trunk' }] } }) });
    expect(await loadWorkoutCategories()).toEqual([{ id: 'core', label: 'Trunk' }]);
    expect(config.get).toHaveBeenCalledWith('config/llm');
    // A successful read is kept for the session.
    expect(await loadWorkoutCategories()).toEqual([{ id: 'core', label: 'Trunk' }]);
    expect(config.get).toHaveBeenCalledTimes(2);
  });
});
