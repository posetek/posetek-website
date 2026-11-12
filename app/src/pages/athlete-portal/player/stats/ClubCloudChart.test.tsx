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
