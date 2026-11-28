import { describe, expect, it } from 'vitest';
import fixture from '../../../lib/contracts/__fixtures__/workout-category-fixture.json';
import domainFile from '../../../lib/contracts/__fixtures__/workout-category-domains.json';
import { normalizeCatalogDrill } from '../../../lib/contracts/drillV2';
import { workoutCategoryGroups } from '../../../lib/contracts/workoutCategory';
import { personalCatalogDrill } from './personal-workouts';

const rows = Object.entries(fixture.rows as Record<string, { workoutCategory: string; status: string | null }>);
const domains = domainFile.domains as Record<string, string>;

describe('personal workouts catalog categories', () => {
  it('gives every fixture row its home, with and without a stored workoutCategory', () => {
    for (const [id, row] of rows) {
      expect(personalCatalogDrill(id, { domain: domains[id], status: row.status }).workoutCategory).toBe(row.workoutCategory);
      expect(personalCatalogDrill(id, { domain: domains[id], status: row.status, workoutCategory: row.workoutCategory }).workoutCategory).toBe(row.workoutCategory);
    }
    const catalog = rows.map(([id, row]) => personalCatalogDrill(id, { domain: domains[id], status: row.status }));
    expect(Object.fromEntries(workoutCategoryGroups(catalog, d => d.workoutCategory ?? null).map(g => [g.id, g.count]))).toEqual(fixture.categoryCounts);
  });

  it('otherwise matches the normalized drill, so focus domains are unchanged', () => {
    const raw = { schemaVersion: 1, name: 'Box jump', domain: 'verticalPower', status: 'published' };
    const { workoutCategory, ...rest } = personalCatalogDrill('VJP-008', raw);
    expect(workoutCategory).toBe('speedAgility');
    expect(rest).toEqual(normalizeCatalogDrill('VJP-008', raw));
    expect(rest.domain).toBe('plyometrics');
  });

  it('leaves the field unset when no rule applies', () => {
    expect(personalCatalogDrill('XYZ-001', { domain: 'mystery' })).not.toHaveProperty('workoutCategory');
  });
});
