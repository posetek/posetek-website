// Synthetic fixtures only: these values are not athlete reference data.
export function pathwayFixture() {
  return [
    {key: 'speedAt5m', label: 'Speed at 5 m', unit: 'mph', center: 10},
    {key: 'verticalJump', label: 'Vertical jump', unit: 'in', center: 12},
    {key: 'broadJump', label: 'Broad jump', unit: 'ft', center: 5},
  ].map(metric => ({
    key: metric.key, label: metric.label, unit: metric.unit, direction: 'higher',
    athlete: {ageGroup: 13, value: metric.center, percentile: 50, placementStatus: 'placed'},
    reference: {sexReferenceGroup: 'girls', label: 'Synthetic tested age groups', sourceDate: '2026-11-07', selectionRule: 'One qualified result per child in the latest reviewed session.'},
    groups: Array.from({length: 10}, (_, i) => {
      const ageGroup = i + 8, n = ageGroup === 10 ? 3 : [11, 12, 13, 15].includes(ageGroup) ? 8 : 0;
      return {ageGroup, n, status: n === 0 ? 'missing' : n < 5 ? 'sparse' : 'available', median: n >= 5 ? metric.center : null,
        density: n >= 5 ? [{value: metric.center - 1, weight: 0}, {value: metric.center, weight: 1}, {value: metric.center + 1, weight: 0}] : []};
    }),
    notes: ['Synthetic fixture. Gaps are intentional.'],
  }));
}
