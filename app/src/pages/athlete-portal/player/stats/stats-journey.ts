import { EngagementClock, IDLE_MS, WEB_USAGE_BUILD } from '../../../../lib/insight-usage/clock';
import type { PlayerRoute } from '../workspace';

/**
 * The Stats page journey (docs/features/STATS_JOURNEY.md): one record per visit to the Stats main
 * page, sent to our own `recordStatsJourney` callable. A visit is one continuous showing of that
 * page; anything else shown ends it, and coming back starts a new one. Numbers only: no page
 * addresses, typed text or recordings, and the server stamps every time.
 *
 * Pure: the browser adapter (`use-stats-journey.ts`) supplies `send` and the environment, so tests
 * drive the same lifecycle with a fake clock.
 */
export type JourneyPlace = 'stats' | 'home' | 'coach' | 'workouts' | 'plan' | 'other';
export type JourneyDestination = Exclude<JourneyPlace, 'stats'>;
export type JourneyButton = 'coach' | 'plan' | 'workout';
export type JourneyVia = 'button' | 'tabs' | 'other';
export type JourneyEvent =
  | { event: 'landed'; from: 'open' | JourneyDestination; platform: 'web'; build: string }
  | { event: 'viewing'; seconds: number }
  | { event: 'reached' }
  | { event: 'clicked'; button: JourneyButton }
  | { event: 'left'; to: JourneyDestination; via: JourneyVia }
  | { event: 'outcome'; kind: JourneyButton };
export type JourneyPayload = { schemaVersion: 1; visitId: string; playerId: string } & JourneyEvent;
export type JourneyResponse = { accepted?: boolean; reason?: string } | null | undefined;

export interface JourneyEnvironment {
  wall(): number;
  mono(): number;
  /** The document is visible (hidden tabs and minimized windows count nothing). */
  visible(): boolean;
  newId(): string;
  on(name: string, listener: (event: { isTrusted?: boolean }) => void): () => void;
  every(milliseconds: number, action: () => void): () => void;
}

/**
 * What the workspace shows now: the Stats main page only when `place` is 'stats'. `actor` is the
 * signed-in account, or nothing once signed out. It is only compared here, never sent.
 */
export type JourneyShown = { tracked: boolean; playerId: string | null | undefined; place: JourneyPlace; actor: string | null | undefined };

/** The client label every landing sends; the server accepts only `^[a-z0-9.-]{1,32}$`. */
export const JOURNEY_BUILD = WEB_USAGE_BUILD;
export const JOURNEY_BEAT_SECONDS = 15;
/** A follow-through counts for the latest visit only this long after that visit began (the server's window). */
export const JOURNEY_OUTCOME_WINDOW_MS = 2 * 60 * 60 * 1000;
/** No counted activity this long (hidden, or visible but idle) ends a visit without a `left`; activity starts a new one. */
export const JOURNEY_INACTIVE_MS = 30 * 60 * 1000;
/** A button or tab press explains only the page change it caused, not a later Back. */
const VIA_MS = 1000;
const INTERACTIONS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

/** Where the workspace is, in the journey's words. A test's attempts page is "other": it is more Stats, not training. */
export function journeyPlace(route: Pick<PlayerRoute, 'view' | 'screen'>, overlay = false): JourneyPlace {
  if (overlay) return 'other';
  if (route.view === 'stats') return route.screen === 'plan' ? 'plan' : 'stats';
  if (route.view === 'workouts') return route.screen === 'plan' ? 'plan' : route.screen === 'test' ? 'other' : 'workouts';
  return route.view;
}

/** Never the sample preview, a share link or a "view as" link (the usage clock's exclusions), and only with a player. */
export function journeyTracked(access: string | null | undefined, playerId: string | null | undefined, search: string): boolean {
  if (!playerId || access === 'preview' || access === 'shared') return false;
  const query = new URLSearchParams(search);
  return !['preview', 'share', 'viewAs', 'viewAsPlayerId'].some(key => query.has(key));
}

/** `crypto.randomUUID` where the browser has it (Safari 15.4+), otherwise the same v4 shape from random bytes. */
export function newVisitId(source: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = crypto): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Visit = {
  id: string; playerId: string; actor: string; startedAt: number; dead: boolean; reached: boolean; clicked: boolean;
  outcomes: Set<JourneyButton>; clock: EngagementClock; countedMs: number; activeAt: number; interactedAt: number; stopTicker: () => void;
};

export function createStatsJourney({ send, env, build = JOURNEY_BUILD }: {
  /** `actor` is the account the visit began under: the adapter sends only while that account is still signed in. */
  send(payload: JourneyPayload, actor: string): Promise<JourneyResponse>; env: JourneyEnvironment; build?: string;
}) {
  // `shown` is the athlete whose Stats main page is on screen; `visit` the visit in progress there,
  // if any (an inactive one ends while the page stays shown, and activity starts the next).
  let shown: string | null = null, visit: Visit | null = null, latest: Visit | null = null, previous: JourneyPlace | null = null;
  let disabled = false, inView = false, via: { value: JourneyVia; at: number } | null = null, lastActor: string | null = null;
  // Account and athlete pairs whose landing the server refused as permission-denied (a linked parent
  // while the recorder accepts only the athlete and staff, or staff who lost access): asked once per page session.
  const refused = new Set<string>();
  const pair = (target: Visit) => JSON.stringify([target.actor, target.playerId]);
  // One sequential queue: a visit's `landed` is answered before any later event of it goes.
  let queue: Promise<void> = Promise.resolve();
  const deliver = (target: Visit, event: JourneyEvent) => {
    if (disabled || target.dead || refused.has(pair(target))) return;
    const payload = { schemaVersion: 1, visitId: target.id, playerId: target.playerId, ...event } as JourneyPayload;
    queue = queue.then(async () => {
      if (disabled || target.dead || refused.has(pair(target))) return;
      let result: JourneyResponse;
      try { result = await send(payload, target.actor); } catch (error) {
        result = null;
        if (event.event === 'landed' && String((error as { code?: unknown } | null)?.code ?? '').replace(/^functions\//, '') === 'permission-denied') refused.add(pair(target));
      }
      if (result?.accepted === false && result.reason === 'disabled') disabled = true;
      // A landing that was not accepted (for any reason, or an error) leaves a dead visit: nothing more
      // goes for it. A late refusal means the server takes nothing more for it either.
      else if ((event.event === 'landed' && result?.accepted !== true) || (result?.accepted === false && result.reason === 'late')) target.dead = true;
    });
  };
  // Visible, recently touched time on the page (the usage clock's two-minute idle rule), in 15 s beats.
  const sample = () => {
    if (!visit) return;
    for (const row of visit.clock.sample(env.mono(), env.wall())) {
      visit.countedMs += row.endedAtMillis - row.startedAtMillis;
      visit.activeAt = Math.max(visit.activeAt, row.endedAtMillis);
    }
    visit.clock.configure(env.visible(), 'overview');
    while (visit.countedMs >= JOURNEY_BEAT_SECONDS * 1000) {
      visit.countedMs -= JOURNEY_BEAT_SECONDS * 1000;
      deliver(visit, { event: 'viewing', seconds: JOURNEY_BEAT_SECONDS });
    }
  };
  // The whole counted seconds not yet sent, right away (the fraction waits for the next beat), so a
  // visit that ends hidden, closed or idle keeps its last seconds. Nothing is ever sent twice.
  const flush = () => {
    if (!visit) return;
    const seconds = Math.floor(visit.countedMs / 1000);
    if (seconds < 1) return;
    visit.countedMs -= seconds * 1000;
    deliver(visit, { event: 'viewing', seconds });
  };
  const reach = (value: boolean) => {
    inView = value;
    if (value && visit && !visit.reached) { visit.reached = true; deliver(visit, { event: 'reached' }); }
  };
  const start = (playerId: string, from: 'open' | JourneyDestination) => {
    // Showing the page is the visitor's own doing (a tap, a link or a load): it counts as interaction.
    const clock = new EngagementClock(env.mono(), env.wall());
    clock.configure(env.visible(), 'overview');
    visit = latest = { id: env.newId(), playerId, actor: lastActor!, startedAt: env.wall(), dead: false, reached: false, clicked: false,
      outcomes: new Set(), clock, countedMs: 0, activeAt: env.wall(), interactedAt: env.mono(), stopTicker: env.every(1000, tick) };
    deliver(visit, { event: 'landed', from, platform: 'web', build });
    if (inView) reach(true);
  };
  const end = (to: JourneyDestination) => {
    sample(); flush();
    const ending = visit!;
    visit = null; ending.stopTicker();
    deliver(ending, { event: 'left', to, via: via && env.mono() - via.at <= VIA_MS ? via.value : 'other' });
  };
  /** Thirty minutes without counted activity: the visit is over, with nothing more sent (the report reads it as left). */
  const expire = () => {
    sample();
    if (!visit || env.wall() - visit.activeAt < JOURNEY_INACTIVE_MS) return false;
    visit.stopTicker();
    if (latest === visit) latest = null;
    visit = null;
    return true;
  };
  /** The account signed out or changed: its visit is dropped with nothing sent (the server would refuse it). */
  const abandon = () => { visit?.stopTicker(); visit = null; latest = null; shown = null; via = null; };
  // Once counting stops on a visible but idle page (two minutes untouched), its last seconds go too.
  function tick() { if (!expire() && visit && env.visible() && env.mono() - visit.interactedAt >= IDLE_MS) flush(); }
  // The visitor is active on the page again: after an expired visit, that is a new visit opened here.
  const resume = () => {
    expire();
    if (shown && !visit && env.visible()) start(shown, 'open');
  };
  const stops = [
    ...INTERACTIONS.map(name => env.on(name, event => {
      if (!event.isTrusted || !shown) return;
      resume();
      if (visit) { visit.clock.interact(env.mono()); visit.interactedAt = env.mono(); }
    })),
    env.on('visibilitychange', () => { if (env.visible()) resume(); else { sample(); flush(); } }),
    env.on('pagehide', () => { sample(); flush(); }),
  ];
  return {
    /** Called whenever what the workspace shows changes, and with `tracked: false` when it closes. */
    show({ tracked, playerId, place, actor }: JourneyShown) {
      // A sign-out or another account since the last showing: what was open belonged to the earlier
      // sign-in. It reads as having left the site, and the next account's first landing is 'open'.
      if ((actor ?? null) !== lastActor) { abandon(); previous = null; lastActor = actor ?? null; }
      const stats = tracked && !!actor && !!playerId && place === 'stats';
      if (visit && (!stats || visit.playerId !== playerId) && !expire()) end(place === 'stats' ? 'other' : place);
      shown = stats ? playerId! : null;
      if (shown && !visit) start(shown, previous === null ? 'open' : previous === 'stats' ? 'other' : previous);
      previous = actor ? place : null; via = null;
    },
    /** The page change about to happen comes from the tab bar (or a next-step button). */
    via(value: JourneyVia) { via = { value, at: env.mono() }; },
    clicked(button: JourneyButton) {
      if (!visit) return;
      via = { value: 'button', at: env.mono() };
      if (!visit.clicked) { visit.clicked = true; deliver(visit, { event: 'clicked', button }); }
    },
    /** At least half of the next-step section is in the viewport. */
    reach,
    /** Follow-through anywhere in the workspace, credited once per kind to the latest visit of this player. */
    outcome(kind: JourneyButton, playerId: string) {
      // Never an unaccepted (dead) or inactivity-ended visit: `latest` is cleared when one expires.
      const target = latest;
      if (!target || target.dead || target.playerId !== playerId || env.wall() - target.startedAt >= JOURNEY_OUTCOME_WINDOW_MS || target.outcomes.has(kind)) return;
      target.outcomes.add(kind);
      deliver(target, { event: 'outcome', kind });
    },
    dispose() { visit?.stopTicker(); visit = null; shown = null; stops.forEach(stop => stop()); },
    /** Resolves once everything queued so far has been answered (tests). */
    settled: () => queue,
  };
}
export type StatsJourney = ReturnType<typeof createStatsJourney>;
