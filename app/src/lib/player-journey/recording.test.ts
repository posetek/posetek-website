import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserClientKind } from '../insight-usage/browser';
import { validSavedBatch } from '../insight-usage/clock';
import { EngagementQueue } from '../insight-usage/queue';
import type { UsageStorage } from '../insight-usage/queue';
import type { UsageEnvironment } from '../insight-usage/session';
import { createJourneyRecorder, JOURNEY_INACTIVE_MS, JOURNEY_QUEUE_PREFIX, validSavedJourneyBatch } from './recording';
import type { JourneyBatch } from './recording';

const NOW = 1_800_000_000_000;
const id = (n: number) => `00112233-4455-4677-8899-aabbccdd${String(n).padStart(4, '0')}`;
function storage(): UsageStorage {
  const rows = new Map<string, string>();
  return {
    get length() { return rows.size; },
    key: i => [...rows.keys()][i] ?? null,
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => { rows.set(key, value); },
    removeItem: key => { rows.delete(key); },
  };
}

function harness(overrides: { saved?: UsageStorage; instance?: number; visible?: boolean; owner?: string } = {}) {
  const owner = overrides.owner ?? 'owner', saved = overrides.saved ?? storage();
  const signals = new Map<string, Parameters<UsageEnvironment['on']>[1]>();
  const state = { uid: owner as string | undefined, online: true, visible: overrides.visible ?? true, progressingVideo: false };
  const fire = (name: string, event: Parameters<Parameters<UsageEnvironment['on']>[1]>[0] = {}) => signals.get(name)?.(event);
  const batches: JourneyBatch[] = [];
  const queue = new EngagementQueue<JourneyBatch>(owner, id(overrides.instance ?? 900), saved, undefined, Date.now, JOURNEY_QUEUE_PREFIX, validSavedJourneyBatch);
  let visit = (overrides.instance ?? 900) + 1;
  const recorder = createJourneyRecorder({
    uid: owner, playerId: `player_${owner}`, clientKind: 'desktop_web', queue,
    makeId: () => id(visit++), firstEntry: () => 'sign_in',
    invoke: async batch => { batches.push(batch); return { accepted: true }; },
    environment: {
      wall: Date.now, mono: () => Date.now() - NOW, currentUid: () => state.uid, online: () => state.online, visible: () => state.visible,
      progressingVideo: () => state.progressingVideo,
      on: (name, callback) => { signals.set(name, callback); return () => { signals.delete(name); }; },
      every: (ms, callback) => { const timer = setInterval(callback, ms); return () => clearInterval(timer); },
    },
  });
  recorder.start();
  return { state, fire, saved, recorder, batches, events: () => batches.flatMap(batch => batch.events) };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const fakeTime = () => vi.useFakeTimers({ now: NOW });
afterEach(() => vi.useRealTimers());

describe('authenticated browser journeys', () => {
  it('waits for a visible resolved screen and keeps click, navigation, accepted outcome and exit distinct', async () => {
    fakeTime();
    const h = harness({ visible: false });
    h.recorder.show('stats');
    await tick(20000);
    expect(h.events()).toEqual([]);

    h.state.visible = true; h.fire('visibilitychange');
    await tick(1000);
    h.recorder.click('plan');
    const created = h.recorder.outcome('plan_created');
    h.recorder.show('plan');
    h.recorder.show('plan');
    created?.();
    await tick(40000);
    h.recorder.leave('left_workspace');
    await tick(8000);
    expect(h.events().filter(event => event.kind !== 'dwell')).toEqual([
      { kind: 'page_view', page: 'stats', atMillis: NOW + 20000 },
      { kind: 'click', page: 'stats', target: 'plan', atMillis: NOW + 21000 },
      { kind: 'page_view', page: 'plan', atMillis: NOW + 21000 },
      { kind: 'outcome', page: 'stats', target: 'plan_created', atMillis: NOW + 21000 },
      { kind: 'exit', page: 'plan', reason: 'left_workspace', atMillis: NOW + 61000 },
    ]);
    expect(h.batches.every(row => row.entry === 'sign_in' && row.sessionStartedAtMillis === NOW + 20000)).toBe(true);
    expect(h.batches.map(row => row.sequence)).toEqual(h.batches.map((_, index) => index));
    h.recorder.close();
  });

  it('counts no background or untrusted idle time and starts a new visit on later activity', async () => {
    fakeTime();
    const h = harness();
    h.recorder.show('stats');
    await tick(10000);
    h.fire('blur');
    await tick(60000);
    h.fire('focus');
    await tick(30000);
    h.fire('pointerdown', { isTrusted: false });
    await tick(65000);
    const dwell = h.events().filter(event => event.kind === 'dwell');
    expect(dwell.reduce((sum, row) => sum + row.endedAtMillis - row.startedAtMillis, 0)).toBe(60000);
    expect(dwell.every(row => row.endedAtMillis <= NOW + 10000 || row.startedAtMillis >= NOW + 70000)).toBe(true);
    await tick(JOURNEY_INACTIVE_MS);
    expect(h.events().filter(event => event.kind === 'page_view')).toHaveLength(1);
    expect(h.events().some(event => event.kind === 'exit')).toBe(false);
    h.fire('keydown', { isTrusted: true });
    await tick(1000);
    expect(h.batches.at(-1)?.entry).toBe('open');
    expect(h.batches.at(-1)?.sessionId).not.toBe(h.batches[0].sessionId);
    h.recorder.close();
  });

  it('starts a new visible visit after a backgrounded tab times out without making up an exit', async () => {
    fakeTime();
    const h = harness();
    h.recorder.show('workouts');
    await tick(1000);
    h.fire('pagehide');
    await tick(JOURNEY_INACTIVE_MS + 1000);
    expect(h.events().filter(event => event.kind === 'page_view')).toHaveLength(1);
    h.fire('pageshow');
    await tick(1000);
    expect(h.events().filter(event => event.kind === 'page_view')).toHaveLength(2);
    expect(h.events().some(event => event.kind === 'exit')).toBe(false);
    expect(h.batches.at(-1)?.entry).toBe('open');
    h.recorder.close();
  });

  it('retries saved batches for the same owner and never replays under a different owner', async () => {
    fakeTime();
    const initial = harness();
    initial.state.online = false;
    initial.recorder.show('stats');
    initial.recorder.click('workouts');
    initial.recorder.show('workouts');
    initial.recorder.close();
    expect(initial.events()).toEqual([]);

    const foreign = harness({ saved: initial.saved, instance: 501, owner: 'different' });
    await tick(1000);
    expect(foreign.events()).toEqual([]);
    foreign.recorder.close();

    const restored = harness({ saved: initial.saved, instance: 600, visible: false });
    await tick(20000);
    expect(restored.events().filter(event => event.kind === 'page_view').map(event => event.page)).toEqual(['stats', 'workouts']);
    expect(restored.events().filter(event => event.kind === 'click')).toHaveLength(1);
    expect(restored.batches.every(batch => batch.playerId === 'player_owner')).toBe(true);
    const box = restored.batches[0];
    expect(validSavedJourneyBatch({ ...box, url: 'private' }, Date.now())).toBe(false);
    expect(validSavedJourneyBatch({ ...box, events: [{ ...box.events[0], text: 'private' }] }, Date.now())).toBe(false);
    restored.recorder.close();
  });
});

describe('browser usage classification', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1', 'MacIntel', 0, 'desktop_web'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1', 'MacIntel', 5, 'mobile_web'],
    ['Mozilla/5.0 (Linux; Android 13) Chrome/120', 'Linux armv8l', 5, 'mobile_web'],
    ['Mozilla/5.0 (X11; Linux x86_64) Chrome/120', 'Linux x86_64', 5, 'unknown_web'],
    ['', '', 0, 'unknown_web'],
  ])('classifies %s without transmitting raw evidence', (userAgent, platform, maxTouchPoints, expected) => {
    expect(browserClientKind({ userAgent, platform, maxTouchPoints })).toBe(expected);
  });

  it('continues adopting v1 batches alongside valid v2 browser kinds', () => {
    const v1 = { schemaVersion: 1, sessionId: id(1), sequence: 0, platform: 'web', build: 'web-insights-v2',
      intervals: [{ startedAtMillis: NOW - 1000, endedAtMillis: NOW, feature: 'overview' }] };
    expect(validSavedBatch(v1, NOW)).toBe(true);
    expect(validSavedBatch({ ...v1, schemaVersion: 2, clientKind: 'mobile_web' }, NOW)).toBe(true);
    expect(validSavedBatch({ ...v1, schemaVersion: 2, clientKind: 'ios' }, NOW)).toBe(false);
    expect(validSavedBatch({ ...v1, schemaVersion: 2, clientKind: 'mobile_web', userAgent: 'private' }, NOW)).toBe(false);
  });
});
