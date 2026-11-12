import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePathwayCharts } from '../app/private-report/render.mjs';
import { pathwayFixture } from './fixtures/private-parent-pathway.mjs';

test('legacy report extension is optional and three bounded aggregate charts validate', () => {
  assert.equal(validatePathwayCharts(undefined, undefined), false);
  assert.equal(validatePathwayCharts(pathwayFixture(), 1), true);
  assert.throws(() => validatePathwayCharts(pathwayFixture(), 2));
  assert.throws(() => validatePathwayCharts([], 1));
});

test('sparse and absent reference groups may show own qualified value, never a percentile or density', () => {
  for (const [age, state] of [[10, 'sparse-reference'], [9, 'no-reference']]) {
    const charts = pathwayFixture();
    charts[0].athlete = {ageGroup: age, value: 10, percentile: null, placementStatus: state};
    assert(validatePathwayCharts(charts, 1));
    charts[0].athlete.percentile = 50;
    assert.throws(() => validatePathwayCharts(charts, 1), /Unsupported percentile/);
  }
  const charts = pathwayFixture();
  charts[0].groups[2].density = [{value: 8, weight: 1}, {value: 10, weight: 1}];
  assert.throws(() => validatePathwayCharts(charts, 1), /Sparse groups/);
});

test('unverified demographics and withheld results cannot become plotted or ranked', () => {
  const charts = pathwayFixture();
  charts[0].athlete = {ageGroup: null, value: 10, percentile: null, placementStatus: 'age-unverified'};
  assert(validatePathwayCharts(charts, 1));
  charts[0].athlete.placementStatus = 'placed';
  assert.throws(() => validatePathwayCharts(charts, 1), /Unverified plotted/);
  charts[0].athlete = {ageGroup: 13, value: null, percentile: null, placementStatus: 'no-valid-result'};
  assert(validatePathwayCharts(charts, 1));
  charts[0].athlete.value = 10;
  assert.throws(() => validatePathwayCharts(charts, 1), /Unqualified result/);
  const unknown = pathwayFixture();
  unknown[0].reference.sexReferenceGroup = null;
  assert.throws(() => validatePathwayCharts(unknown, 1), /Unverified reference/);
});

test('metric units, age order, counts, density order and finite coordinates are enforced', () => {
  for (const mutate of [
    c => c[0].unit = 'm/s', c => c[0].key = 'peakSpeed', c => c[0].direction = 'lower',
    c => c[0].groups.reverse(), c => c[0].groups[3].n = 4,
    c => c[0].groups[3].density[1].value = c[0].groups[3].density[0].value,
    c => c[0].groups[3].density[1].weight = 1.1,
    c => c[0].groups[3].median = Infinity,
    c => c[0].athlete.value = NaN, c => c[0].athlete.ageGroup = 18,
    c => c[0].groups[3].density = Array(65).fill({value: 1, weight: 1}),
    c => c[0].groups[3].rows = [{name: 'Never publish a peer row'}],
  ]) {
    const charts = pathwayFixture(); mutate(charts); assert.throws(() => validatePathwayCharts(charts, 1));
  }
});
