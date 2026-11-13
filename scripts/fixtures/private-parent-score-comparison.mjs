// Synthetic report for the local preview and browser acceptance.
import { readFileSync } from 'node:fs';
const result = (key, label, value, median, percentile, band, curve) => ({
  key, label, status: 'measured', result: value, percentile, band, average: value, count: 8,
  ...(median ? { comparison: median } : {}),
  ...(curve ? { curve } : {}),
});

const sprintCurve = {
  label: 'Speed at 5 m', unit: 'mph', cohort: 'Example Club · U-age groups', through: '2026-11-10',
  points: [{ age: 10, mean: 9.5, sd: 0.9 }, { age: 11, mean: 10.9, sd: 1.2 }, { age: 12, mean: 11.3, sd: 1.4 }, { age: 13, mean: 12.6, sd: 1.1 }],
  own: { age: 11, value: 12.1, average: 10.8 },
};
const jumpCurve = {
  label: 'Jump height', unit: 'in', cohort: 'Example Club · U-age groups',
  points: [{ age: 10, mean: 10.1, sd: 1.2 }, { age: 11, mean: 11.8, sd: 2.1 }, { age: 12, mean: 14.3, sd: 2.5 }],
};

export const scoreComparisonFixture = {
  version: 1, name: 'Sample Athlete', firstName: 'Sample', playerId: 'syntheticPlayer123',
  team: 'Example U11', coach: 'Example Coach', testDate: 'Nov 10, 2026',
  focusTitle: 'Your results', focusText: 'Synthetic preview.', resultsFirst: true, visualLayout: 'score-cards-v2',
  playerSignupUrl: 'https://posetek.net/signin#playerCode=FIXTURE-CODE',
  metrics: [
    result('sprint', 'Sprint', '2.52 s', { value: 2.52, median: 2.76, count: 7 }, 80, 'strong', sprintCurve),
    result('jump', 'Vertical jump', '12.0 in', { value: 12, median: 13.2, count: 7 }, 20, 'practice', jumpCurve),
    result('dribbleLeft', 'Left-course dribble', '7.10 s', { value: 7.10, median: 7.10, count: 7 }, 50, 'middle'),
    result('changeOfDirection', 'Shuttle run', '6.60 s', { value: 6.60, median: 6.33, count: 7 }, 35, 'middle'),
    { key: 'dribbleRight', label: 'Right-course dribble', status: 'unavailable', result: null, percentile: null, band: 'unavailable', average: null, count: 0 },
    { ...result('broadJump', 'Broad jump', '5.1 ft', null, null, 'unranked'), count: 4, average: null },
  ],
  summary: [], exercises: [], methodNotes: [],
  pdfBase64: readFileSync(new URL('./private-parent-score-comparison.pdf', import.meta.url)).toString('base64'),
};
