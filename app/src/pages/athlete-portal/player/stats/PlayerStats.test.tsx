import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { previewData } from '../../lib/preview';
import { allStatsReps } from '../../lib/metrics';
import { DEMO_REPORT } from '../report';
import type { ReportState } from '../report';
import { playerProfile, defaultDataset } from '../scoring';
import type { PlayerTabProps } from '../workspace';
import PlayerStats from './PlayerStats';
import SkillBenchmarks, { defaultRadarAxis, radarAxes } from './SkillBenchmarks';

const data = previewData();
const ctx = { ...data, notify: () => {}, allStatsReps: () => allStatsReps(data.reps) };
const profile = playerProfile(allStatsReps(data.reps), data.athlete, defaultDataset);
const report = (patch: Partial<ReportState> = {}): ReportState => ({ report: { ...DEMO_REPORT, playerId: data.playerId }, limitedComparison: false, error: null, loading: false, reload: () => {}, ...patch });
const render = (state: ReportState) => {
  const props = { ctx, route: { view: 'stats', screen: null, page: 'tests', drill: 'shooting', session: null, rep: null }, go: () => {}, back: () => {}, active: true, preview: true,
    athlete: { ...data.athlete, position: 'ST' }, reps: data.reps, personal: {} as PlayerTabProps['personal'], report: state } as PlayerTabProps;
  return renderToStaticMarkup(<MemoryRouter><PlayerStats {...props} profile={profile} dataset={defaultDataset} /></MemoryRouter>);
};
const visible = (html: string) => html.replace(/<section class="mobile-page body-profile-page">[\s\S]*?<\/section><\/section>/, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('Stats tab (V4 StatsView)', () => {
  it('shows the sections in the app order and nothing from the old profile screen', () => {
    const html = render(report()), text = visible(html);
    const order = ['Stats', 'Jordan Rivera', 'Skill benchmarks', 'SKILL MAP', '5/5 recorded', '100 = the D1 reference. Reference values are provisional.',
      'Standing', 'What you’re doing well', 'What we’ll build next', 'Striker. Position-based development', 'Drills from your plan', 'Body scan', '5\'10"', '159 lbs', 'Streak', 'Total Sessions', 'Favorite Drill'];
    let at = -1;
    for (const item of order) { const next = text.indexOf(item, at + 1); expect(next, item).toBeGreaterThan(at); at = next; }
    for (const removed of ['Leaderboards', 'Your skill map', 'How the skill map is scored', 'Profile details', 'Technique analysis', 'Review AI sharing', 'Day streak']) expect(html).not.toContain(removed);
  });
  it('keeps the report states inside the same page', () => {
    expect(visible(render(report({ report: null, loading: true })))).toContain('Your report Loading your report');
    expect(visible(render(report({ report: null })))).toContain('Your report will appear after your first assessment.');
  });
  it('labels each radar axis with its score against D1 and opens on the weakest', () => {
    const axes = radarAxes(profile);
    expect(axes.map(axis => axis.label)).toEqual(['Power', 'Speed', 'Agility', 'Ball Control', 'Striking']);
    const html = renderToStaticMarkup(<SkillBenchmarks profile={profile} />);
    const weakest = defaultRadarAxis(axes), label = axes.find(axis => axis.key === weakest)!.label;
    expect(html).toMatch(new RegExp(`aria-pressed="true" aria-label="${label}, \\d+ versus D1"`));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const empty = renderToStaticMarkup(<SkillBenchmarks profile={playerProfile([])} />);
    expect(empty).toContain('0/5 recorded'); expect(empty).toContain('aria-label="Speed, no data"');
    expect(empty).not.toContain('stats-radar-athlete');
  });
});
