import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/firebase', () => ({ auth: {}, cloud: {}, db: {} }));
import { coachCatalogRows } from './data';

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
      name: 'Plank', domain: 'strength', status: 'published', schemaVersion: 2,
      dose: { doseText: '3 sets x 30 s' }, estimatedMinutes: { min: 4, max: 6 }, cues: ['Brace'], execution: 'Hold.', ...heavy,
    })]);
    expect(row).toEqual({
      id: 'GYM-002', drillId: 'GYM-002', name: 'Plank', domain: 'strength', status: 'published', schemaVersion: 2,
      dose: { doseText: '3 sets x 30 s' }, estimatedMinutes: { min: 4, max: 6 }, cues: ['Brace'], execution: 'Hold.',
    });
    for (const key of Object.keys(heavy)) expect(row).not.toHaveProperty(key);
  });
});
