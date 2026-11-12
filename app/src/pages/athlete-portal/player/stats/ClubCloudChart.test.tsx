import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ClubCloudChart from './ClubCloudChart';
import type { ClubStats } from './club-cloud';

const groups = [
  { ageGroup: 11, count: 8, mean: 7.8, sd: 0.4 }, { ageGroup: 12, count: 6, mean: 7.6, sd: 0.4 },
  { ageGroup: 14, count: 12, mean: 7.2, sd: 0.5 }, { ageGroup: 15, count: 8, mean: 7.0, sd: 0.4 },
];
const stats = (patch: Partial<ClubStats> = {}): ClubStats => ({
  unit: 's', higherIsBetter: false, athletes: 36, groups, overall: { count: 36, mean: 7.4, sd: 0.5 },
  own: { ageGroup: 11, best: 7.4, results: [7.9, 7.4, 8.1] }, ...patch,
});
const render = (value: ClubStats) => renderToStaticMarkup(<ClubCloudChart stats={value} title="Vacaville United · Boys" context={['36 players', 'lower is better']} digits={2} />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('club cloud chart', () => {
  it('draws one line and one layered cloud, no point per athlete', () => {
    const html = render(stats());
    expect(html.match(/class="club-cloud-line"/g)).toHaveLength(1);
    expect(html.match(/<path /g)!.length).toBeGreaterThan(10);
    expect(html).toContain('Average and spread by age · 36 players · lower is better');
  });

  it("shows every testing day's result, the best emphasised and labelled", () => {
    const html = render(stats());
    const own = html.match(/<g class="club-cloud-own">([\s\S]*?)<\/g>/)![1];
    // Two other days as hollow rings, then the glow and the best.
    expect(own.match(/<circle /g)).toHaveLength(4);
    expect(own.match(/stroke-width="2"/g)).toHaveLength(2);
    expect(own).toContain('class="club-cloud-you"');
    expect(text(html)).toContain('You · 7.40 s');
    expect(text(html)).toContain('best of 3 testing days');
    expect(html).toContain('class="club-cloud-age is-own"');
  });

  it("says where the best sits against the average at the athlete's age group", () => {
    expect(text(render(stats()))).toMatch(/7\.40 s 0\.\d\d s faster than the U11 average/);
    expect(render(stats())).toContain('data-standing="better"');
    const jump = render(stats({ unit: 'in', higherIsBetter: true, own: { ageGroup: 14, best: 6.9, results: [6.9] } }));
    expect(text(jump)).toMatch(/6\.90 in 0\.\d\d in below the U14 average/);
    expect(jump).toContain('data-standing="worse"');
    expect(text(jump)).not.toContain('testing days');
  });

  it('reads a speed (higher is better) as faster or slower, with the faster values higher up', () => {
    const speeds = [{ ageGroup: 11, count: 8, mean: 9.8, sd: 0.6 }, { ageGroup: 12, count: 6, mean: 10.2, sd: 0.6 }, { ageGroup: 14, count: 12, mean: 11.0, sd: 0.7 }];
    const speed = (best: number) => renderToStaticMarkup(<ClubCloudChart stats={stats({ unit: 'mph', higherIsBetter: true, groups: speeds, overall: { count: 26, mean: 10.5, sd: 0.8 },
      own: { ageGroup: 12, best, results: [best] } })} title="Vacaville United · Boys" context={['Speed at 5 m', '26 players']} digits={1} />);
    const fast = speed(11.0);
    expect(text(fast)).toContain('Average and spread by age · Speed at 5 m · 26 players');
    expect(text(fast)).not.toContain('lower is better');
    expect(text(fast)).toContain('You · 11.0 mph');
    expect(text(fast)).toMatch(/11\.0 mph 0\.8 mph faster than the U12 average/);
    expect(fast).toContain('data-standing="better"');
    const slow = speed(9.6);
    expect(text(slow)).toMatch(/9\.6 mph 0\.6 mph slower than the U12 average/);
    expect(slow).toContain('data-standing="worse"');
    // The value axis: a larger speed sits higher on the plot (a smaller y).
    const ticks = [...fast.matchAll(/y="([\d.]+)" text-anchor="end">([\d.]+)/g)].map(match => [Number(match[2]), Number(match[1])]);
    expect(ticks.length).toBeGreaterThan(2);
    for (let i = 1; i < ticks.length; i++) { expect(ticks[i][0]).toBeGreaterThan(ticks[i - 1][0]); expect(ticks[i][1]).toBeLessThan(ticks[i - 1][1]); }
    const course = renderToStaticMarkup(<ClubCloudChart stats={stats({ unit: 'm/s', higherIsBetter: true, own: { ageGroup: 11, best: 2.1, results: [2.1] },
      groups: [{ ageGroup: 11, count: 8, mean: 2.0, sd: 0.2 }], overall: { count: 8, mean: 2.0, sd: 0.2 } })} title="t" context={['Course speed']} digits={2} />);
    expect(text(course)).toMatch(/2\.10 m\/s 0\.10 m\/s faster than the U11 average/);
  });

  it('falls back to the whole club outside the curve, and says when there is no result', () => {
    expect(text(render(stats({ own: { ageGroup: 9, best: 7.9, results: [7.9] } })))).toContain('0.50 s slower than the club average');
    expect(text(render(stats({ own: null })))).toContain('No result for you on this test yet.');
  });

  it('draws no cloud without an age group of five, and lists the groups for screen readers', () => {
    const thin = render(stats({ groups: [], own: { ageGroup: null, best: 7.4, results: [7.4] } }));
    expect(thin).not.toContain('<svg');
    expect(text(thin)).toContain('Not enough players in any age group to draw the club curve yet.');
    expect(text(render(stats()))).toContain('U14 12 7.20 s 0.50 s');
  });
});
