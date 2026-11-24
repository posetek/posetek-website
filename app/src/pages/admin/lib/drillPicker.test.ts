import { describe, expect, it } from 'vitest';
import { normalizeCatalogDrill } from '../../../lib/contracts/drillV2';
import { DOMAINS } from '../../../lib/contracts/types';
import { categorizedCatalogDrill } from '../../../lib/contracts/workoutCategory';
import { pickerCategories, pickerRows } from './drillPicker';

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

  const library = [
    drill('DRB-1', 'dribbling'), drill('COR-1', 'strength'), drill('GYM-031', 'strength'), drill('GYM-001', 'strength'),
    drill('SPD-1', 'speed'), drill('HIT-1', 'strength', 'draft'),
    categorizedCatalogDrill('STR-9', { schemaVersion: 2, name: 'Drill STR-9', domain: 'strength', status: 'published', workoutCategory: 'core' }),
  ];

  it('filters by home workout category, using a stored category before the fallback', () => {
    const ids = (category: string) => pickerRows(library, '', category, false, athlete).map(row => row.drillId);
    expect(ids('speedAgility')).toEqual(['SPD-1', 'GYM-031']);
    expect(ids('core')).toEqual(['COR-1', 'STR-9']);
    expect(ids('gym')).toEqual(['GYM-001']);
    expect(ids('hiit')).toEqual([]);
  });

  it('lists the categories that hold published drills, in registry order', () => {
    expect(pickerCategories(library).map(g => `${g.label} ${g.count}`)).toEqual(['Soccer 1', 'Speed/agility 2', 'Core 2', 'Strength 1']);
    const registry = [{ id: 'gym', label: 'Weights' }, { id: 'soccer', label: 'Soccer' }];
    expect(pickerCategories(library, registry).map(g => g.label)).toEqual(['Weights', 'Soccer', 'Speed/agility', 'Core']);
    expect(pickerRows(library, '', 'all', false, athlete, registry).map(row => row.drillId)).toEqual(['GYM-001', 'DRB-1', 'SPD-1', 'GYM-031', 'COR-1', 'STR-9']);
  });
});
