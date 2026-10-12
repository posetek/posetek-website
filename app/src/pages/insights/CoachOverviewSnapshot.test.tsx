import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CoachOverviewSnapshot from './CoachOverviewSnapshot';
import { expandedRequest } from './lib/expandedQuery';
import { previewInsights } from './lib/preview';

const request = expandedRequest('orgId=northfield&teamId=harbor', new Date('2026-09-29T12:00:00Z'));
const render = (data: ReturnType<typeof previewInsights>) => renderToStaticMarkup(<MemoryRouter><CoachOverviewSnapshot data={data} playerLink={player => `/insights?orgId=club&teamId=team&view=player&playerId=${player.id}`} /></MemoryRouter>);
describe('coach evidence-focused snapshot', () => {
  it('shows missing additive evidence as unavailable without falling back to legacy sign-in or D1 flags', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    delete data.overview!.coachFocus;
    data.overview!.needsYouPlayers = [{ id: 'legacy', name: 'Legacy sign-in flag', reasons: ['No sign-in recorded'] }];
    const html = render(data);
    for (const label of ['Follow-up summary unavailable', 'Completion summary unavailable', 'Testing trend summary unavailable', 'Player names unavailable']) expect(html).toContain(label);
    for (const label of ['No workout or testing flags', 'D1', 'Legacy sign-in flag', 'No sign-in recorded']) expect(html).not.toContain(label);
  });
  it('counts players once while showing explicit workout and testing review paths independently', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    data.overview!.coachFocus = { version: 1, noCompletionPlayers: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Blair' }], decliningPlayers: [{ id: 'a', name: 'Alex' }] };
    const html = render(data);
    expect(html).toContain('Needs you</dt><dd class="coach-snapshot-value">2');
    expect(html).toContain('No completed workouts'); expect(html).toContain('Recent testing down');
    expect(html).toContain('playerId=a'); expect(html).toContain('orgId=club');
    expect(html).toContain('same measured metrics'); expect(html).not.toContain('D1');
    expect(html).not.toContain('No workout status');
  });
  it('preserves observed zero and keeps missing tests out of follow-up', () => {
    const data = previewInsights(request, 0, 'normal', 'coach');
    data.overview!.coachFocus = { version: 1, noCompletionPlayers: [], decliningPlayers: [] };
    const html = render(data);
    expect(html).toContain('No workout or testing flags'); expect(html.match(/coach-snapshot-none">None/g)).toHaveLength(2);
    expect(html).not.toContain('unavailable');
  });
});
