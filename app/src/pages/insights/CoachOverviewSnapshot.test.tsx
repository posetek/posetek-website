import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CoachOverviewSnapshot from './CoachOverviewSnapshot';
import { expandedRequest } from './lib/expandedQuery';
import { previewInsights } from './lib/preview';

const request = expandedRequest('orgId=northfield&teamId=harbor', new Date('2026-09-29T12:00:00Z'));
const render = (data: ReturnType<typeof previewInsights>) => renderToStaticMarkup(<MemoryRouter><CoachOverviewSnapshot data={data} playerLink={player => `/insights?orgId=club&teamId=team&view=player&playerId=${player.id}`} /></MemoryRouter>);
describe('coach measured-progress snapshot', () => {
  it('shows missing evidence as Unavailable without borrowing legacy scores, flags or roster pages', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    delete data.overview!.coachFocus;
    delete data.overview!.coachTesting;
    data.overview!.needsYouPlayers = [{ id: 'legacy', name: 'Legacy flag', reasons: ['No sign-in recorded'] }];
    const html = render(data);
    expect(html.match(/is-unavailable">Unavailable/g)).toHaveLength(3);
    expect(html).toContain('Unavailable. Refresh');
    for (const label of ['D1', 'Legacy flag', 'No sign-in recorded', 'coach-evidence-player"']) expect(html).not.toContain(label);
  });
  it('starts with review, shows both sides of mixed results and preserves player context', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    const mixed = data.overview!.coachTesting!.reviewPlayers.find(player => player.status === 'mixed')!;
    data.overview!.coachTesting!.reviewPlayers = [mixed];
    const html = render(data);
    expect(html).toContain('is-review" aria-pressed="true"');
    for (const label of ['Mixed results', 'Previous', 'Latest', 'Change', 'faster', 'slower', 'Latest known results · through Sep 29, 2026']) expect(html).toContain(label);
    expect(html).toContain(`playerId=${mixed.id}`); expect(html).toContain('orgId=club');
    expect(html).not.toContain('D1'); expect(html).not.toContain('Needs you');
  });
  it('defaults to improvement without reviews and limits to five players with an all-player action', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    const player = data.overview!.coachTesting!.improvingPlayers[0];
    data.overview!.coachTesting!.reviewPlayers = [];
    data.overview!.coachTesting!.improvingPlayers = Array.from({ length: 8 }, (_, i) => ({ ...player, id: `id-${i}`, name: `Player ${i}` }));
    const html = render(data);
    expect(html).toContain('is-improving" aria-pressed="true"');
    expect(html.match(/class="coach-evidence-player"/g)).toHaveLength(5);
    expect(html).toContain('Show all 8'); expect(html).not.toContain('Player 5');
    expect(html).toContain(`${data.overview!.coachTesting!.comparablePlayers} players with comparable results`);
  });
  it('preserves observed zero and shows an honest empty roster', () => {
    const html = render(previewInsights(request, 0, 'empty', 'coach'));
    expect(html.match(/coach-overview-number">0/g)).toHaveLength(3);
    expect(html).toContain('No players in this selection.');
    expect(html).toContain('is-workouts" aria-pressed="true"');
    expect(html).not.toContain('Unavailable');
  });
});
