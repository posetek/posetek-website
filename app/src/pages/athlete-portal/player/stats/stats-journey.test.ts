import { describe, expect, it } from 'vitest';
import { createStatsJourney, journeyPlace, journeyTracked, newVisitId, JOURNEY_BUILD, JOURNEY_INACTIVE_MS, JOURNEY_OUTCOME_WINDOW_MS } from './stats-journey';
import type { JourneyEnvironment, JourneyPayload, JourneyPlace, JourneyResponse } from './stats-journey';

/** A deterministic page: a monotonic and a wall clock, visibility, DOM-like events and interval timers. */
function page() {
  let mono = 0, wall = Date.UTC(2026, 10, 13, 18), visible = true, ids = 0;
  const listeners = new Map<string, Set<(event: { isTrusted?: boolean }) => void>>();
  const timers: { every: number; next: number; action: () => void; alive: boolean }[] = [];
  const sent: JourneyPayload[] = [], accounts: string[] = [];
  let respond: (payload: JourneyPayload) => Promise<JourneyResponse> = async () => ({ accepted: true });
  const env: JourneyEnvironment = {
    wall: () => wall, mono: () => mono, visible: () => visible,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    on: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      return () => { listeners.get(name)!.delete(listener); };
    },
    every: (milliseconds, action) => {
      const timer = { every: milliseconds, next: mono + milliseconds, action, alive: true };
      timers.push(timer);
      return () => { timer.alive = false; };
    },
  };
  // The browser adapter passes no build either: every landing names JOURNEY_BUILD.
  const journey = createStatsJourney({ env, send: (payload, account) => { sent.push(payload); accounts.push(account); return respond(payload); } });
  const advance = (milliseconds: number) => {
    const end = mono + milliseconds;
    for (;;) {
      const due = timers.filter(timer => timer.alive && timer.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      wall += due.next - mono; mono = due.next; due.next += due.every; due.action();
    }
    wall += end - mono; mono = end;
  };
  const emit = (name: string, isTrusted = true) => listeners.get(name)?.forEach(listener => listener({ isTrusted }));
  // The signed-in account; `signIn(null)` is a sign-out.
  let actor: string | null = 'account-1';
  const show = (place: JourneyPlace, playerId: string | null = 'player-1', tracked = true) => journey.show({ tracked, playerId, place, actor });
  const events = async () => { await journey.settled(); return sent.map(({ schemaVersion: _version, visitId: _visit, playerId: _player, ...rest }) => rest); };
  return {
    journey, sent, accounts, advance, emit, show, events,
    signIn: (next: string | null) => { actor = next; },
    /** The workspace closing (another page of the site, or the sign-in page after a sign-out). */
    close: () => journey.show({ tracked: false, playerId: null, place: 'other', actor }),
    hide: () => { visible = false; emit('visibilitychange'); },
    reveal: () => { visible = true; emit('visibilitychange'); },
    respond: (next: typeof respond) => { respond = next; },
    activeTimers: () => timers.filter(timer => timer.alive).length,
  };
}

describe('Stats page journey: visits', () => {
  it('starts a visit when Stats is shown, ends it when anything else is, and starts a new one on return', async () => {
    const p = page();
    p.show('stats');
    p.show('home');
    p.show('stats');
    expect(await p.events()).toEqual([
      { event: 'landed', from: 'open', platform: 'web', build: 'web-insights-v2' },
      { event: 'left', to: 'home', via: 'other' },
      { event: 'landed', from: 'home', platform: 'web', build: 'web-insights-v2' },
    ]);
    expect(p.sent[0].visitId).toBe(p.sent[1].visitId);
    expect(p.sent[2].visitId).not.toBe(p.sent[0].visitId);
    expect(p.sent.every(payload => payload.schemaVersion === 1 && payload.playerId === 'player-1')).toBe(true);
    // Exactly the contract's keys, nothing extra.
    expect(Object.keys(p.sent[0]).sort()).toEqual(['build', 'event', 'from', 'platform', 'playerId', 'schemaVersion', 'visitId']);
    expect(Object.keys(p.sent[1]).sort()).toEqual(['event', 'playerId', 'schemaVersion', 'to', 'via', 'visitId']);
  });

  it('sends a build label the server accepts, so a rename cannot silently stop recording', async () => {
    expect(JOURNEY_BUILD).toBe('web-insights-v2');
    expect(JOURNEY_BUILD).toMatch(/^[a-z0-9.-]{1,32}$/);
    const p = page();
    p.show('stats');
    await p.journey.settled();
    const landed = p.sent[0];
    expect(landed.event === 'landed' && landed.build).toBe(JOURNEY_BUILD);
  });

  it('says where the visitor came from, and "open" only for the first thing shown', async () => {
    const p = page();
    for (const place of ['coach', 'stats', 'workouts', 'stats', 'plan', 'stats', 'other', 'stats'] as const) p.show(place);
    const landed = (await p.events()).filter(event => event.event === 'landed').map(event => 'from' in event && event.from);
    expect(landed).toEqual(['coach', 'workouts', 'plan', 'other']);
    const fresh = page();
    fresh.show('home'); fresh.show('stats');
    expect((await fresh.events())[0]).toMatchObject({ event: 'landed', from: 'home' });
  });

  it('ends the visit when the workspace closes, and a different athlete is a different visit', async () => {
    const p = page();
    p.show('stats', 'player-1');
    p.show('stats', 'player-2');
    p.close();
    const events = await p.events();
    expect(events.map(event => event.event)).toEqual(['landed', 'left', 'landed', 'left']);
    expect(p.sent.map(payload => payload.playerId)).toEqual(['player-1', 'player-1', 'player-2', 'player-2']);
    expect(events[1]).toEqual({ event: 'left', to: 'other', via: 'other' });
    expect(p.activeTimers()).toBe(0);
    // Back in the workspace under the same sign-in, the visitor came from another page.
    p.show('stats');
    expect((await p.events()).at(-1)).toMatchObject({ event: 'landed', from: 'other' });
  });

  it('drops the open visit unsent on sign-out, and the next account starts fresh from "open"', async () => {
    const p = page();
    p.show('stats'); p.advance(20000); p.journey.clicked('coach');
    const before = (await p.events()).length;
    // Signing out unmounts the workspace with nobody signed in: the server would refuse anything sent now.
    p.signIn(null); p.close();
    expect((await p.events()).length).toBe(before);
    expect(p.activeTimers()).toBe(0);
    // Nothing of the earlier account's visit is credited or continued.
    p.journey.outcome('coach', 'player-1'); p.emit('pointerdown'); p.advance(60000);
    expect((await p.events()).length).toBe(before);
    p.signIn('account-2'); p.show('stats');
    const events = await p.events();
    expect(events.slice(before)).toEqual([{ event: 'landed', from: 'open', platform: 'web', build: JOURNEY_BUILD }]);
    expect(new Set(p.sent.map(payload => payload.visitId)).size).toBe(2);
  });

  it('starts fresh when another account is signed in without the workspace closing first', async () => {
    const p = page();
    p.show('coach'); p.show('stats'); p.advance(5000);
    p.signIn('account-2'); p.show('stats');
    const events = await p.events();
    expect(events.map(event => event.event)).toEqual(['landed', 'landed']);
    expect(events[1]).toMatchObject({ from: 'open' });
    p.show('stats', 'player-1', true); p.signIn(null); p.show('stats');
    expect((await p.events()).length).toBe(2);
  });

  it('hands every event to the sender with the account its visit began under', async () => {
    const p = page();
    p.show('stats'); p.journey.clicked('coach'); p.show('coach');
    p.signIn('account-2'); p.show('stats');
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'clicked', 'left', 'landed']);
    // The browser adapter sends only while that same account is signed in.
    expect(p.accounts).toEqual(['account-1', 'account-1', 'account-1', 'account-2']);
  });

  it('makes a visit id in the server\'s shape with or without crypto.randomUUID', () => {
    const shape = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    const bytes = { getRandomValues: <T extends ArrayBufferView | null>(array: T) => { if (array instanceof Uint8Array) array.forEach((_, index) => { array[index] = (index * 37 + 11) % 256; }); return array; } };
    expect(newVisitId(bytes)).toMatch(shape);
    expect(newVisitId({ ...bytes, randomUUID: () => '11111111-2222-4333-8444-555555555555' })).toBe('11111111-2222-4333-8444-555555555555');
    expect(newVisitId()).toMatch(shape);
  });

  it('records nothing for the sample preview, share and view-as links, or without a player', async () => {
    for (const [access, playerId, search] of [['preview', 'p1', '?preview=1'], ['athlete', 'p1', '?preview=1'], ['shared', 'p1', ''], ['athlete', 'p1', '?share=token'],
      ['admin', 'p1', '?viewAs=p1'], ['admin', 'p1', '?viewAsPlayerId=p1'], ['athlete', null, '']] as const) {
      expect(journeyTracked(access, playerId, search), `${access} ${search}`).toBe(false);
    }
    // Staff looking at an athlete's own workspace ("Player view") are recorded; the server marks them.
    expect(journeyTracked('admin', 'p1', '?player=p1&workspace=player')).toBe(true);
    expect(journeyTracked('athlete', 'p1', '?view=stats')).toBe(true);
    const p = page();
    p.show('stats', 'player-1', false); p.advance(60000); p.journey.clicked('coach'); p.journey.reach(true); p.show('coach', 'player-1', false);
    p.journey.outcome('coach', 'player-1');
    p.show('stats', null);
    expect(await p.events()).toEqual([]);
  });

  it('names each workspace place', () => {
    expect(journeyPlace({ view: 'stats', screen: null })).toBe('stats');
    expect(journeyPlace({ view: 'stats', screen: 'plan' })).toBe('plan');
    expect(journeyPlace({ view: 'stats', screen: null }, true)).toBe('other');
    expect(journeyPlace({ view: 'workouts', screen: null })).toBe('workouts');
    expect(journeyPlace({ view: 'workouts', screen: 'history' })).toBe('workouts');
    expect(journeyPlace({ view: 'workouts', screen: 'plan' })).toBe('plan');
    expect(journeyPlace({ view: 'workouts', screen: 'test' })).toBe('other');
    expect(journeyPlace({ view: 'home', screen: null })).toBe('home');
    expect(journeyPlace({ view: 'coach', screen: null })).toBe('coach');
  });
});

describe('Stats page journey: time on the page', () => {
  it('beats every 15 counted seconds, stops two minutes after the last interaction, and sends the rest before leaving', async () => {
    const p = page();
    p.show('stats');
    p.advance(130000);
    expect((await p.events()).filter(event => event.event === 'viewing')).toHaveLength(8);
    // An untrusted (scripted) event is not the visitor.
    p.emit('pointerdown', false); p.advance(10000);
    expect((await p.events()).filter(event => event.event === 'viewing')).toHaveLength(8);
    p.emit('pointerdown'); p.advance(7000);
    p.hide(); p.advance(60000);
    p.reveal(); p.emit('scroll'); p.advance(5500);
    p.show('workouts');
    const events = await p.events();
    // Hiding the page sends its 7 seconds at once; leaving sends the last 5 (half a second waits).
    expect(events.slice(1)).toEqual([
      ...Array.from({ length: 8 }, () => ({ event: 'viewing', seconds: 15 })),
      { event: 'viewing', seconds: 7 },
      { event: 'viewing', seconds: 5 },
      { event: 'left', to: 'workouts', via: 'other' },
    ]);
  });

  it('sends the counted seconds when the page is hidden: a 10 s visit records 10 s', async () => {
    const p = page();
    p.show('stats'); p.advance(10000);
    p.hide(); p.advance(JOURNEY_INACTIVE_MS + 60000);
    expect((await p.events()).map(event => event.event === 'viewing' ? event.seconds : event.event)).toEqual(['landed', 10]);
  });

  it('counts again from zero after the page comes back, and never sends a second twice', async () => {
    const p = page();
    p.show('stats'); p.advance(10000);
    p.hide(); p.advance(60000);
    p.reveal(); p.emit('pointerdown');
    // The next beat comes after 15 new seconds, not after the 5 a carried-over 10 would need.
    p.advance(14000);
    expect((await p.events()).filter(event => event.event === 'viewing')).toEqual([{ event: 'viewing', seconds: 10 }]);
    p.advance(1000);
    p.show('home');
    expect((await p.events()).slice(1)).toEqual([{ event: 'viewing', seconds: 10 }, { event: 'viewing', seconds: 15 }, { event: 'left', to: 'home', via: 'other' }]);
  });

  it('adds up to the true counted time across a flush, a later beat and a closed page', async () => {
    const p = page();
    p.show('stats'); p.advance(7500);
    p.hide(); p.reveal(); p.emit('pointerdown');
    // 0.5 s carried over plus 14.5 s makes the next 15 s beat.
    p.advance(14500); p.advance(3200);
    p.emit('pagehide'); p.emit('pagehide');
    await p.journey.settled();
    const seconds = p.sent.flatMap(payload => payload.event === 'viewing' ? [payload.seconds] : []);
    expect(seconds).toEqual([7, 15, 3]);
    expect(seconds.reduce((sum, value) => sum + value, 0)).toBe(Math.floor((7500 + 14500 + 3200) / 1000));
  });

  it('sends the last seconds once a visible page goes idle, then nothing when the visit expires', async () => {
    const p = page();
    p.show('stats'); p.advance(7000); p.emit('pointerdown');
    // Counting stops two minutes after that touch, at 127 s: 8 beats and 7 s left.
    p.advance(130000);
    p.advance(JOURNEY_INACTIVE_MS);
    expect((await p.events()).slice(1)).toEqual([...Array.from({ length: 8 }, () => ({ event: 'viewing', seconds: 15 })), { event: 'viewing', seconds: 7 }]);
  });

  it('counts nothing while hidden and sends no remainder under a second', async () => {
    const p = page();
    p.show('stats');
    p.hide(); p.advance(90000); p.reveal();
    p.emit('keydown'); p.advance(900);
    p.show('home');
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'left']);
  });

  it('counts only while the Stats page is shown', async () => {
    const p = page();
    p.show('stats'); p.emit('touchstart'); p.advance(16000);
    p.show('coach'); p.advance(60000);
    p.show('stats'); p.advance(3000); p.show('home');
    const viewing = (await p.events()).filter(event => event.event === 'viewing');
    expect(viewing).toEqual([{ event: 'viewing', seconds: 15 }, { event: 'viewing', seconds: 1 }, { event: 'viewing', seconds: 3 }]);
  });
});

describe('Stats page journey: inactivity', () => {
  const MINUTE = 60000;
  const ids = (p: ReturnType<typeof page>) => [...new Set(p.sent.map(payload => payload.visitId))];

  it('continues the same visit after 29 minutes hidden', async () => {
    const p = page();
    p.show('stats'); p.advance(5000);
    p.hide(); p.advance(29 * MINUTE);
    p.reveal(); p.emit('pointerdown'); p.advance(3000);
    p.show('home');
    expect(await p.events()).toEqual([
      { event: 'landed', from: 'open', platform: 'web', build: JOURNEY_BUILD },
      { event: 'viewing', seconds: 5 },
      { event: 'viewing', seconds: 3 },
      { event: 'left', to: 'home', via: 'other' },
    ]);
    expect(ids(p)).toHaveLength(1);
  });

  it('ends a visit after 30 minutes hidden with nothing more sent, and the page becoming visible opens a new one', async () => {
    const p = page();
    p.show('stats'); p.advance(5000);
    p.hide(); p.advance(JOURNEY_INACTIVE_MS);
    p.reveal(); p.advance(3000);
    p.show('home');
    await p.journey.settled();
    const [first, second] = ids(p);
    // Its 5 seconds went when the page was hidden; nothing is sent when it expires.
    expect(p.sent.filter(payload => payload.visitId === first).map(payload => payload.event)).toEqual(['landed', 'viewing']);
    expect(p.sent.filter(payload => payload.visitId === second).map(({ schemaVersion: _v, visitId: _id, playerId: _p, ...event }) => event)).toEqual([
      { event: 'landed', from: 'open', platform: 'web', build: JOURNEY_BUILD },
      { event: 'viewing', seconds: 3 },
      { event: 'left', to: 'home', via: 'other' },
    ]);
  });

  it('ends a visit 30 minutes after its last counted second while visible but idle; the next interaction opens a new one', async () => {
    const p = page();
    p.show('stats'); p.journey.reach(true);
    // Two counted minutes, then 30 idle minutes.
    p.advance(2 * MINUTE + JOURNEY_INACTIVE_MS + MINUTE);
    p.emit('keydown'); p.advance(1000);
    p.journey.clicked('plan'); p.show('plan');
    await p.journey.settled();
    const [first, second] = ids(p);
    expect(p.sent.filter(payload => payload.visitId === first).map(payload => payload.event)).toEqual(['landed', 'reached', ...Array(8).fill('viewing')]);
    expect(p.sent.filter(payload => payload.visitId === second).map(payload => payload.event)).toEqual(['landed', 'reached', 'clicked', 'viewing', 'left']);
    expect(p.sent.find(payload => payload.visitId === second && payload.event === 'landed')).toMatchObject({ from: 'open' });
  });

  it('credits follow-through to the new visit, never the abandoned one, and sends no left for an expired visit', async () => {
    const p = page();
    p.show('stats'); p.journey.clicked('coach');
    p.hide(); p.advance(JOURNEY_INACTIVE_MS + MINUTE);
    // Expired while hidden: neither leaving nor a follow-through reaches it.
    p.journey.outcome('coach', 'player-1');
    p.reveal(); p.emit('pointerdown');
    p.journey.clicked('coach'); p.show('coach');
    p.journey.outcome('coach', 'player-1');
    p.show('stats'); p.hide(); p.advance(JOURNEY_INACTIVE_MS); p.show('home');
    await p.journey.settled();
    const [first, second, third] = ids(p);
    expect(p.sent.filter(payload => payload.visitId === first).map(payload => payload.event)).toEqual(['landed', 'clicked']);
    expect(p.sent.filter(payload => payload.visitId === second).map(payload => payload.event)).toEqual(['landed', 'clicked', 'left', 'outcome']);
    expect(p.sent.filter(payload => payload.visitId === third).map(payload => payload.event)).toEqual(['landed']);
  });
});

describe('Stats page journey: the next steps', () => {
  it('reports the buttons coming into view once per visit, including a section already in view', async () => {
    const p = page();
    p.journey.reach(true);
    p.show('stats');
    p.journey.reach(false); p.journey.reach(true);
    p.show('home');
    p.journey.reach(false);
    p.show('stats'); p.journey.reach(true);
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'reached', 'left', 'landed', 'reached']);
    // Out of view while away: nothing.
    const q = page();
    q.journey.reach(true); q.journey.reach(false); q.show('stats');
    expect((await q.events()).map(event => event.event)).toEqual(['landed']);
  });

  it('records the click before the navigation it causes, and the visit leaves by the button', async () => {
    const p = page();
    p.show('stats');
    p.journey.clicked('coach'); p.journey.clicked('plan');
    p.show('coach');
    expect((await p.events()).slice(1)).toEqual([{ event: 'clicked', button: 'coach' }, { event: 'left', to: 'coach', via: 'button' }]);
  });

  it('tells the tab bar from any other link, and a press explains only the change it caused', async () => {
    const p = page();
    p.show('stats'); p.journey.via('tabs'); p.show('home');
    p.show('stats'); p.show('workouts');
    // Tapping Stats while on Stats changes nothing; that tap does not explain a later change.
    p.show('stats'); p.journey.via('tabs'); p.show('stats'); p.show('other');
    p.show('stats'); p.journey.via('tabs'); p.advance(2000); p.show('home');
    // A click that led nowhere does not explain a later Back.
    p.show('stats'); p.journey.clicked('workout'); p.advance(5000); p.show('plan');
    const left = (await p.events()).filter(event => event.event === 'left');
    expect(left).toEqual([
      { event: 'left', to: 'home', via: 'tabs' }, { event: 'left', to: 'workouts', via: 'other' }, { event: 'left', to: 'other', via: 'other' },
      { event: 'left', to: 'home', via: 'other' }, { event: 'left', to: 'plan', via: 'other' },
    ]);
  });

  it('ignores a click or tab press with no visit on screen', async () => {
    const p = page();
    p.show('home'); p.journey.clicked('coach'); p.journey.via('tabs'); p.journey.reach(true);
    expect(await p.events()).toEqual([]);
  });
});

describe('Stats page journey: follow-through', () => {
  it('credits the latest visit of the same athlete, once per kind, within two hours of its start', async () => {
    const p = page();
    p.show('stats'); p.journey.clicked('coach'); p.show('coach');
    p.journey.outcome('coach', 'player-1');
    p.journey.outcome('coach', 'player-1');
    p.journey.outcome('plan', 'player-2');
    p.journey.outcome('workout', 'player-1');
    await p.journey.settled();
    const first = p.sent[0].visitId;
    p.show('stats'); p.show('workouts');
    p.journey.outcome('coach', 'player-1');
    await p.journey.settled();
    const second = p.sent.find(payload => payload.event === 'landed' && payload.visitId !== first)!.visitId;
    p.advance(JOURNEY_OUTCOME_WINDOW_MS);
    p.journey.outcome('plan', 'player-1');
    await p.journey.settled();
    const outcomes = p.sent.filter(payload => payload.event === 'outcome').map(payload => [payload.visitId, 'kind' in payload && payload.kind]);
    expect(outcomes).toEqual([[first, 'coach'], [first, 'workout'], [second, 'coach']]);
  });

  it('has nothing to credit before any visit', async () => {
    const p = page();
    p.show('coach'); p.journey.outcome('coach', 'player-1');
    expect(await p.events()).toEqual([]);
  });
});

describe('Stats page journey: delivery', () => {
  it('delivers a slow landing before anything else of its visit, in order', async () => {
    const p = page();
    let land!: (value: JourneyResponse) => void;
    p.respond(payload => payload.event === 'landed' && !land ? new Promise(resolve => { land = resolve; }) : Promise.resolve({ accepted: true }));
    p.show('stats'); p.journey.reach(true); p.journey.clicked('plan'); p.show('plan'); p.journey.outcome('plan', 'player-1');
    await Promise.resolve(); await Promise.resolve();
    expect(p.sent.map(payload => payload.event)).toEqual(['landed']);
    land({ accepted: true });
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'reached', 'clicked', 'left', 'outcome']);
  });

  it('drops the rest of a visit whose landing was refused or failed, and tries the next visit', async () => {
    const p = page();
    let calls = 0;
    p.respond(async () => { calls++; if (calls === 1) throw new Error('offline'); return { accepted: true }; });
    p.show('stats'); p.journey.reach(true); p.show('home');
    p.show('stats'); p.show('coach');
    await p.journey.settled();
    expect(p.sent.map(payload => payload.event)).toEqual(['landed', 'landed', 'reached', 'left']);
    // Not accepted for any reason: no beats, reached, clicked, left or follow-through for that visit.
    for (const reason of ['no-organization', 'late', 'unknown-visit', undefined]) {
      const q = page();
      q.respond(async payload => payload.event === 'landed' ? { accepted: false, reason } : { accepted: true });
      q.show('stats'); q.journey.reach(true); q.advance(40000); q.journey.clicked('coach'); q.show('coach');
      q.journey.outcome('coach', 'player-1');
      expect((await q.events()).map(event => event.event), String(reason)).toEqual(['landed']);
      q.journey.outcome('plan', 'player-1');
      expect((await q.events()).map(event => event.event), String(reason)).toEqual(['landed']);
      // The page session goes on: the next visit records normally.
      q.respond(async () => ({ accepted: true }));
      q.show('stats');
      expect((await q.events()).map(event => event.event), String(reason)).toEqual(['landed', 'landed', 'reached']);
    }
  });

  it('stops a visit the server calls late, and only that visit', async () => {
    const p = page();
    let first: string | undefined;
    p.respond(async payload => { first ??= payload.visitId; return payload.event === 'viewing' && payload.visitId === first ? { accepted: false, reason: 'late' } : { accepted: true }; });
    p.show('stats'); p.advance(16000); p.journey.clicked('coach'); p.show('coach'); p.journey.outcome('coach', 'player-1');
    p.show('stats'); p.show('home');
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'viewing', 'landed', 'left']);
  });

  it('stops the page session when collection is switched off mid-visit', async () => {
    const p = page();
    p.respond(async payload => payload.event === 'reached' ? { accepted: false, reason: 'disabled' } : { accepted: true });
    p.show('stats'); p.journey.reach(true); p.journey.clicked('coach'); p.show('coach');
    p.show('stats'); p.journey.outcome('coach', 'player-1'); p.show('home');
    expect((await p.events()).map(event => event.event)).toEqual(['landed', 'reached']);
  });

  it('sends nothing more this page session once collection is switched off', async () => {
    const p = page();
    p.respond(async () => ({ accepted: false, reason: 'disabled' }));
    p.show('stats'); p.journey.reach(true); p.advance(30000); p.show('home');
    p.show('stats'); p.show('coach'); p.journey.outcome('coach', 'player-1');
    await p.journey.settled();
    expect(p.sent.map(payload => payload.event)).toEqual(['landed']);
  });

  it('asks once per page session for an account the server refuses for this athlete, and keeps the others', async () => {
    // A linked parent viewing a child: the recorder refuses the landing as permission-denied.
    const p = page();
    p.signIn('parent-account');
    p.respond(async payload => { if (payload.playerId === 'child-1') throw Object.assign(new Error('You do not have access to this player.'), { code: 'functions/permission-denied' }); return { accepted: true }; });
    p.show('stats', 'child-1'); p.journey.reach(true); p.advance(40000); p.journey.clicked('plan'); p.show('plan'); p.journey.outcome('plan', 'child-1');
    for (const place of ['home', 'stats', 'coach', 'stats'] as const) p.show(place, 'child-1');
    p.emit('pointerdown'); p.advance(60000);
    await p.journey.settled();
    expect(p.sent.map(payload => [payload.event, payload.playerId])).toEqual([['landed', 'child-1']]);
    // Another child the server accepts still records (the refused child's visit leaves unsent).
    p.show('stats', 'child-2'); p.show('home', 'child-2');
    await p.journey.settled();
    expect(p.sent.map(payload => [payload.event, payload.playerId])).toEqual([['landed', 'child-1'], ['landed', 'child-2'], ['reached', 'child-2'], ['left', 'child-2']]);
    // Another account signed in on this page (the athlete themself) is asked again.
    p.signIn('athlete-account'); p.respond(async () => ({ accepted: true })); p.show('stats', 'child-1');
    await p.journey.settled();
    expect(p.sent.slice(-2).map(payload => [payload.event, payload.playerId])).toEqual([['landed', 'child-1'], ['reached', 'child-1']]);
    expect(p.accounts.slice(-2)).toEqual(['athlete-account', 'athlete-account']);
    // Any other failure, an outage for instance, drops only that visit (see above).
    const q = page();
    q.respond(async payload => { if (payload.event === 'landed' && q.sent.length === 1) throw Object.assign(new Error('offline'), { code: 'functions/internal' }); return { accepted: true }; });
    q.show('stats'); q.show('home'); q.show('stats'); q.show('coach');
    expect((await q.events()).map(event => event.event)).toEqual(['landed', 'landed', 'left']);
  });

  it('swallows a send that throws at once and keeps the page going', async () => {
    const p = page();
    p.respond(() => { throw new Error('boom'); });
    expect(() => { p.show('stats'); p.journey.clicked('coach'); p.show('coach'); }).not.toThrow();
    await expect(p.journey.settled()).resolves.toBeUndefined();
  });
});
