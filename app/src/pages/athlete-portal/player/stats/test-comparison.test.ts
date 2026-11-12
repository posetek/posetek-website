import { describe, expect, it } from 'vitest';
import { SPLITS, splitRow, versusTeam } from './test-comparison';

const split = (drill: string, label: string) => SPLITS[drill].find(item => item.label === label)!;

describe('the rep against the team, row by row', () => {
  it('records which way is better for every row', () => {
    const higher = Object.values(SPLITS).flat().filter(item => item.higher).map(item => item.label);
    expect([...new Set(higher)].sort()).toEqual(['Distance', 'Jump height', 'Max acceleration', 'Peak height', 'Top speed']);
    // Every time, and the dribble's ball distance (the ball kept closer), is better lower.
    expect(split('dribbling', 'Ball distance').higher).toBe(false);
    for (const label of ['Total time', 'Out', 'Turn', 'Back']) expect(split('changeOfDirection', label).higher).toBe(false);
  });

  it('a lower time is better and a higher one worse', () => {
    expect(versusTeam(1.93, 2.19, { digits: 2, higher: false })).toEqual({ standing: 'better', difference: -.26 });
    expect(versusTeam(2.12, 1.94, { digits: 2, higher: false })).toEqual({ standing: 'worse', difference: .18 });
  });

  it('a higher jump or speed is better and a lower one worse', () => {
    expect(versusTeam(9.5, 6.9, { digits: 1, higher: true }).standing).toBe('better');
    expect(versusTeam(6.9, 9.5, { digits: 1, higher: true })).toEqual({ standing: 'worse', difference: -2.6 });
  });

  it('is level when the shown figures match or are within about 1%', () => {
    // Different underneath, the same once shown to two decimals.
    expect(versusTeam(7.751, 7.749, { digits: 2, higher: false })).toEqual({ standing: 'level', difference: 0 });
    // 0.03 s on 7.78 s is 0.4%: level, though the difference is still shown.
    expect(versusTeam(7.75, 7.78, { digits: 2, higher: false })).toEqual({ standing: 'level', difference: -.03 });
    // 0.05 s on 3.65 s is 1.4%: worse.
    expect(versusTeam(3.70, 3.65, { digits: 2, higher: false }).standing).toBe('worse');
    // Exactly 1% is still level; just over it is not.
    expect(versusTeam(10.1, 10, { digits: 1, higher: true }).standing).toBe('level');
    expect(versusTeam(10.2, 10, { digits: 1, higher: true }).standing).toBe('better');
  });

  it('builds a row with the signed difference in the row\'s units, or a neutral row without a team value', () => {
    const ball = split('dribbling', 'Ball distance');
    expect(splitRow(ball, 34.6 / 39.3701, 33.2 / 39.3701)).toEqual({ label: 'Ball distance', mine: '34.6 in', average: '33.2 in', standing: 'worse', difference: '+1.4 in' });
    const turn = split('dribbling', 'Turn');
    expect(splitRow(turn, 1.93, 2.19)).toMatchObject({ standing: 'better', difference: '−0.26 s' });
    expect(splitRow(turn, 1.93, undefined)).toEqual({ label: 'Turn', mine: '1.93 s', average: null, standing: null, difference: null });
    expect(splitRow(turn, null, 2.19)).toMatchObject({ mine: null, average: '2.19 s', standing: null, difference: null });
  });

  it('compares the headline row with the report\'s own average in shown units', () => {
    const height = split('jump', 'Jump height');
    expect(splitRow(height, .1764, null, '9.5 in')).toEqual({ label: 'Jump height', mine: '6.9 in', average: '9.5 in', standing: 'worse', difference: '−2.6 in' });
    expect(splitRow(split('changeOfDirection', 'Total time'), 7.75, 7.9, '7.78 s')).toMatchObject({ average: '7.78 s', standing: 'level', difference: '−0.03 s' });
    // An average in a unit the row does not show is listed but not compared.
    expect(splitRow(height, .1764, null, '24.1 cm')).toMatchObject({ average: '24.1 cm', standing: null, difference: null });
  });
});
