import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import WeeklyParticipation from '../views/WeeklyParticipation';
import { usageStoryFixture, usagePlayerFixture } from './usageStory.fixture';
import { usageShare, usageChangeSummary } from './usageStory';
import { expandedRequest } from '../../insights/lib/expandedQuery';
import { previewInsights } from '../../insights/lib/preview';
import { adminDirectoryPath, parseAdminDirectoryState, workspaceReportSearch, selectDirectoryScope } from './adminNavigation';
import { workspaceMetricsPayload, workspacePayloadKey } from './workspaceMetricsData';
import type { AdminActivityReportData } from './adminActivity';

function html(client = 'desktop_web', missing = false, supportedIOSBuilds: string[] = []) {
  const request = expandedRequest(`view=usage&usageClientKind=${client}&end=2026-11-18`, new Date('2026-11-18T20:00:00Z'));
  const data = previewInsights(request);
  data.adminReporting = { usageCohorts: missing ? undefined : { ...usageStoryFixture(), supportedIOSBuilds } } as AdminActivityReportData;
  data.players = data.players.slice(0, 2).map((player, index) => ({ ...player, adminReporting: { ...player.adminReporting!, usage: { lastActivityWindow: null, cohort: usagePlayerFixture(index) } } }));
  return renderToStaticMarkup(<MemoryRouter><WeeklyParticipation data={data} request={request} onChange={() => {}} journeyLink={id => `/admin/accounts?journeyPlayer=${id}`} onFirstPage={() => {}} onNextPage={() => {}} /></MemoryRouter>);
}
describe('weekly participation evidence', () => {
  it('uses all active players as the denominator, including unknown history', () => {
    const result = html();
    expect(result).toContain('20% of 5 weekly active players');
    expect(result).toContain('60% of 5 weekly active players');
    expect(result).toContain('History unknown');
    expect(result).toContain('2026-11-16 – 2026-11-18');
    expect(result).toContain('2026-11-09 – 2026-11-15');
    expect(result).toContain('Week to date');
    expect(result).toContain('Latest activity window');
    expect(result).toContain('12:00 PM – 12:15 PM');
  });
  it('keeps missing and zero distinct and exposes the native coverage boundary', () => {
    expect(usageShare(0, 5)).toBe('0%'); expect(usageShare(null, 5)).toBe('—'); expect(usageShare(0, 0)).toBe('—');
    expect(html('ios')).toContain('Verified iOS builds for this breakdown: none recorded yet');
    expect(html('ios', false, ['1.2.3(456)'])).toContain('Verified iOS builds for this breakdown: 1.2.3(456)');
    expect(html('ios')).toContain('A weekly comparison is not yet available');
    expect(html('desktop_web', true)).toContain('not available in this report yet');
  });
  it('names the weekly and repeat follow-up separately without asserting churn', () => {
    const result = html();
    expect(result).toContain('Previous repeat users · returned on one day'); expect(result).toContain('Previous repeat users · no recorded return');
    expect(result).toContain('View journey'); expect(result).toContain('Missing coverage is reported separately');
    expect(usageChangeSummary(usageStoryFixture().segments.desktop_web)).toContain('2 active in both weeks, 2 added');
  });
  it('round-trips platform, group, named journey, dates, filters and view', () => {
    const initial = parseAdminDirectoryState('?orgId=club&teamId=team&directoryPane=journey&journeyView=players&journeyPlayer=player-1&journeyCohort=existing&journeyEntry=sign_in&reportUsageClientKind=mobile_web&reportUsageCohortGroup=repeat_returned_once&reportStart=2026-11-09&reportEnd=2026-11-18');
    expect(parseAdminDirectoryState(adminDirectoryPath(initial).split('?')[1])).toEqual(initial);
    expect(workspaceReportSearch(initial)).toContain('usageClientKind=mobile_web');
    const switched = selectDirectoryScope(initial, { orgId: 'other' });
    expect(switched.journeyPlayer).toBeUndefined(); expect(switched.journeyCursor).toBeUndefined();
  });
  it('adds cohort inputs only on the opted-in admin Usage reader and keys filters independently', () => {
    const scope = { kind: 'organization' as const, organizationId: 'club' };
    const request = 'view=usage&usageClientKind=mobile_web&usageCohortGroup=repeat_returned_once';
    const payload = workspaceMetricsPayload(request, scope, undefined, new Date(), true, false, false, true);
    expect(payload).toMatchObject({ includeUsageCohorts: true, usageCohortFilter: { clientKind: 'mobile_web', followUp: 'repeat_returned_once' } });
    const plain = workspaceMetricsPayload(request, scope);
    expect(plain).not.toHaveProperty('includeUsageCohorts');
    expect(workspacePayloadKey(payload)).not.toBe(workspacePayloadKey(plain));
    expect(workspaceMetricsPayload('view=testing', scope, undefined, new Date(), true, false, false, true)).not.toHaveProperty('includeUsageCohorts');
  });
});
