import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PlayerJourneys from './PlayerJourneys';
import { parseAdminDirectoryState } from '../lib/adminNavigation';
import type { AdminPlayerJourneys, JourneyOverviewSegment } from '../lib/playerJourneyContract';

const fixture = vi.hoisted(() => ({ loaded: null as unknown }));
vi.mock('../../../lib/firebase', () => ({ cloud: { httpsCallable: vi.fn() } }));
vi.mock('../lib/useAccountLoad', () => ({ useAccountLoad: () => ({ state: fixture.loaded, refresh: () => {} }) }));
vi.mock('./StatsJourney', () => ({ default: () => null }));

function result(builds: string[] = [], count = 0, named = false): AdminPlayerJourneys {
  const common = { version: 1 as const, startDate: '2026-11-16', endDate: '2026-11-17',
    coverageStartedAtMillis: Date.parse('2026-11-16T20:27:30Z'), supportedIOSBuilds: builds, complete: true, nextCursor: null };
  if (named) return { ...common, view: 'player', player: { id: 'synthetic-player', name: 'Synthetic player' }, sessions: [] };
  const segment: JourneyOverviewSegment = { clientKind: 'ios', sessionCount: count, playerCount: count, firstSignInSessionCount: 0,
    ongoingSessions: count, incompleteSessions: 0, pages: [], paths: [], lastPages: [], exits: [], outcomes: [] };
  return { ...common, view: 'overview', segments: [segment], players: [] };
}
function html(named = false) {
  const state = parseAdminDirectoryState(`?orgId=synthetic-club&teamId=synthetic-team&directoryPane=journey&reportUsageClientKind=ios&reportStart=2026-11-16&reportEnd=2026-11-17${named ? '&journeyView=players&journeyPlayer=synthetic-player' : ''}`);
  return renderToStaticMarkup(<MemoryRouter><PlayerJourneys state={state} choose={() => {}} organizationId="synthetic-club" teams={[]} roster={[]} /></MemoryRouter>);
}
describe('Journey coverage states', () => {
  beforeEach(() => { fixture.loaded = { kind: 'ready', data: result() }; });
  it('shows pending iOS collection instead of zero activity when no build is supported', () => {
    const output = html();
    expect(output).toContain('Native iOS journeys need a supported app build');
    expect(output).toContain('View recorded iOS usage');
    expect(output).toContain('reportUsageClientKind=ios');
    expect(output).toContain('reportUsageCohortGroup=active');
    expect(output).toContain('orgId=synthetic-club');
    expect(output).toContain('teamId=synthetic-team');
    expect(output).toContain('reportStart=2026-11-16');
    expect(output).not.toContain('0 recorded players');
    expect(output).not.toContain('No journeys recorded for this platform');
  });
  it('uses the same pending state in a named player view', () => {
    fixture.loaded = { kind: 'ready', data: result([], 0, true) };
    const output = html(true);
    expect(output).toContain('Native iOS journeys need a supported app build');
    expect(output).not.toContain('Older history may have expired');
  });
  it('keeps observed sessions visible even before the supported build list is set', () => {
    fixture.loaded = { kind: 'ready', data: result([], 1) };
    expect(html()).toContain('1 recorded players');
    expect(html()).not.toContain('Native iOS journeys need a supported app build');
  });
  it('keeps supported zero, failed loads and pending builds distinct', () => {
    fixture.loaded = { kind: 'ready', data: result(['1.2.3(456)']) };
    expect(html()).toContain('0 recorded players');
    expect(html()).toContain('No journeys recorded for this platform');
    fixture.loaded = { kind: 'error', error: new Error('Synthetic outage') };
    expect(html()).toContain('Could not load player journeys');
    expect(html()).not.toContain('0 recorded players');
    expect(html()).not.toContain('Native iOS journeys need a supported app build');
  });
});
