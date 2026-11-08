import { describe, expect, it } from 'vitest';
import { normalizeCatalogDrill } from '../../../lib/contracts/drillV2';
import { DOMAINS } from '../../../lib/contracts/types';
import { pickerRows } from './drillPicker';

const athlete = { age: 15, maxDrillDifficulty: 5, setting: 'solo', equipment: [] as string[] };

const drill = (id: string, domain: string, status = 'published') => normalizeCatalogDrill(id, {
  schemaVersion: 2, name: `Drill ${id}`, domain, minAge: 5, maxAge: 99, difficultyLevel: 1, equipment: [], status,
});

describe('admin workout editor picker', () => {
  it('lists every published drill: more than 200 rows, and the last-sorted domain is not dropped', () => {
    const last = DOMAINS[DOMAINS.length - 1];
    const drills = [
      ...Array.from({ length: 240 }, (_, index) => drill(`STR-${index}`, 'strength')),
      drill('GAM-1', last),
      drill('STR-draft', 'strength', 'draft'),
    ];
    const rows = pickerRows(drills, '', 'all', true, athlete);
    expect(rows).toHaveLength(241);
    expect(rows.map(row => row.drillId)).toContain('GAM-1');
    expect(rows.map(row => row.drillId)).not.toContain('STR-draft');
  });
});
