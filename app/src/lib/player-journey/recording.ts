import { BROWSER_CLIENT_KINDS } from '../insight-usage/browser';
import type { BrowserClientKind } from '../insight-usage/browser';
import { EngagementClock, OFFLINE_MS } from '../insight-usage/clock';
import type { UsageEnvironment } from '../insight-usage/session';
import { UsageDelivery } from '../insight-usage/queue';
import type { EngagementQueue } from '../insight-usage/queue';

export const JOURNEY_PAGES = ['home', 'stats', 'workouts', 'plan', 'coach', 'training', 'results', 'video', 'planner', 'feed', 'profile', 'leaderboards', 'settings', 'saved_workouts', 'workout_history', 'tests', 'other'] as const;
export const JOURNEY_TARGETS = [...JOURNEY_PAGES.filter(p => p !== 'other'), 'start_workout', 'generate_plan', 'send_message', 'open_video', 'download_report'] as const;
const ENTRIES = ['sign_in', 'signup', 'restored', 'open', 'continue', 'deep_link', 'report_stats', 'report_workouts'] as const;
const OUTCOMES = ['workout_started', 'plan_created', 'message_sent'] as const;
const EXIT_REASONS = ['sign_out', 'left_workspace'] as const;
export type JourneyPage = typeof JOURNEY_PAGES[number];
export type JourneyTarget = typeof JOURNEY_TARGETS[number];
export type JourneyEntry = typeof ENTRIES[number];
export type JourneyOutcome = typeof OUTCOMES[number];
type ExitReason = typeof EXIT_REASONS[number];
type JourneyEvent = { page: JourneyPage } & (
  { kind: 'page_view'; atMillis: number }
  | { kind: 'click'; atMillis: number; target: JourneyTarget }
  | { kind: 'outcome'; atMillis: number; target: JourneyOutcome }
  | { kind: 'exit'; atMillis: number; reason: ExitReason }
  | { kind: 'dwell'; startedAtMillis: number; endedAtMillis: number }
);
type Visit = { sessionId: string; sessionStartedAtMillis: number; entry: JourneyEntry };
export type JourneyBatch = Visit & {
  schemaVersion: 1; playerId: string; sequence: number; clientKind: BrowserClientKind; build: string; events: JourneyEvent[];
};

export const JOURNEY_QUEUE_PREFIX = 'posetek:player-journey:v1:';
export const JOURNEY_INACTIVE_MS = 30 * 60 * 1000;
const MAX_EVENTS = 60;
const FLUSH_MS = 15000;
const MAX_VISIT_MS = 11 * 60 * 60 * 1000;
const MAX_VISIT_EVENTS = 660;
const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export const isJourneyTarget = (value: unknown): value is JourneyTarget => typeof value === 'string' && JOURNEY_TARGETS.some(target => target === value);
export const isJourneyEntry = (value: unknown): value is JourneyEntry => typeof value === 'string' && ENTRIES.some(entry => entry === value);

function validEvent(e: JourneyEvent, start: number, now: number) {
  const validTime = (n: number) => Number.isSafeInteger(n) && n >= Math.max(start, now - OFFLINE_MS) && n <= now + 60000;
  if (!e || !JOURNEY_PAGES.includes(e.page)) return false;
  const keys = Object.keys(e).sort().join(',');
  if (e.kind === 'dwell') return keys === 'endedAtMillis,kind,page,startedAtMillis'
    && validTime(e.startedAtMillis) && validTime(e.endedAtMillis)
    && e.endedAtMillis > e.startedAtMillis && e.endedAtMillis - e.startedAtMillis <= 60000;
  if (!validTime(e.atMillis)) return false;
  if (e.kind === 'page_view') return keys === 'atMillis,kind,page';
  if (e.kind === 'click') return keys === 'atMillis,kind,page,target' && isJourneyTarget(e.target);
  if (e.kind === 'outcome') return keys === 'atMillis,kind,page,target' && OUTCOMES.includes(e.target);
  return e.kind === 'exit' && keys === 'atMillis,kind,page,reason' && EXIT_REASONS.includes(e.reason);
}

export function validSavedJourneyBatch(value: unknown, now: number): value is JourneyBatch {
  const batch = value as JourneyBatch;
  return !!batch && Object.keys(batch).sort().join(',') === 'build,clientKind,entry,events,playerId,schemaVersion,sequence,sessionId,sessionStartedAtMillis'
    && batch.schemaVersion === 1 && BROWSER_CLIENT_KINDS.includes(batch.clientKind)
    && Number.isSafeInteger(batch.sequence) && batch.sequence >= 0
    && typeof batch.sessionId === 'string' && UUID.test(batch.sessionId)
    && typeof batch.playerId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(batch.playerId)
    && typeof batch.build === 'string' && /^[a-z0-9.-]{1,32}$/.test(batch.build)
    && isJourneyEntry(batch.entry) && Number.isSafeInteger(batch.sessionStartedAtMillis)
    && batch.sessionStartedAtMillis >= now - OFFLINE_MS && batch.sessionStartedAtMillis <= now + 60000
    && Array.isArray(batch.events) && batch.events.length > 0 && batch.events.length <= MAX_EVENTS
    && batch.events.every(e => validEvent(e, batch.sessionStartedAtMillis, now));
}

export function createJourneyRecorder({ uid, playerId, clientKind, queue, environment: env, invoke, makeId, firstEntry }: {
  uid: string; playerId: string; clientKind: BrowserClientKind; queue: EngagementQueue<JourneyBatch>;
  environment: Omit<UsageEnvironment, 'feature'>;
  invoke: (batch: JourneyBatch) => Promise<{ accepted?: boolean; reason?: string }>;
  makeId: () => string; firstEntry: () => JourneyEntry;
}) {
  let shown: JourneyPage | null = null, lastPage: JourneyPage | null = null, visit: Visit | null = null;
  let clock: EngagementClock | null = null, pending: JourneyEvent[] = [], sequence = 0, queuedEvents = 0, lastActive = 0, openedAt = 0;
  let first = true, closed = false, pageSuspended = false, blurry = false;
  const detach: (() => void)[] = [];
  const delivery = new UsageDelivery(uid, queue, env.currentUid, env.online, env.wall, invoke,
    () => { pending = []; }, ['disabled', 'no-organization']);
  const eligible = () => !closed && delivery.active && env.currentUid() === uid;
  const visible = () => eligible() && !pageSuspended && !blurry && env.visible();
  const send = () => { void delivery.send(); };

  const enqueue = () => {
    if (!eligible() || !visit || !pending.length) return;
    queue.append({ ...visit, schemaVersion: 1, playerId, clientKind, build: 'web-player-journey-v1', sequence: sequence++, events: pending });
    queuedEvents += pending.length;
    pending = [];
  };
  const append = (event: JourneyEvent) => {
    pending.push(event);
    if (pending.length >= MAX_EVENTS) enqueue();
  };
  const flush = () => { enqueue(); send(); };
  const time = () => Math.max(visit?.sessionStartedAtMillis ?? 0, env.wall());

  const sample = () => {
    if (!clock) return;
    const mono = env.mono(), rows = clock.sample(mono, env.wall());
    if (!eligible() || !visit || !lastPage) return;
    for (const row of rows) {
      const start = Math.max(row.startedAtMillis, visit.sessionStartedAtMillis);
      if (row.endedAtMillis <= start) continue;
      lastActive = mono;
      const previous = pending.at(-1);
      if (previous?.kind === 'dwell' && previous.page === lastPage && previous.endedAtMillis === start
        && row.endedAtMillis - previous.startedAtMillis <= 60000) {
        previous.endedAtMillis = row.endedAtMillis;
      } else append({ kind: 'dwell', page: lastPage, startedAtMillis: start, endedAtMillis: row.endedAtMillis });
    }
  };
  const expire = () => {
    if (!visit) return;
    const mono = env.mono();
    if (mono - lastActive < JOURNEY_INACTIVE_MS && mono - openedAt < MAX_VISIT_MS && queuedEvents + pending.length < MAX_VISIT_EVENTS) return;
    flush();
    visit = null; clock = null; lastPage = null;
  };
  const show = (interactive: boolean, foregrounded = false) => {
    if (!shown || !visible()) { clock?.configure(false, null); return; }
    if (!visit) {
      if (!first && !interactive && !foregrounded) return;
      visit = { sessionId: makeId(), sessionStartedAtMillis: env.wall(), entry: first ? firstEntry() : 'open' };
      first = false; sequence = 0; queuedEvents = 0; openedAt = lastActive = env.mono();
      clock = new EngagementClock(lastActive, visit.sessionStartedAtMillis);
    }
    if (shown !== lastPage) {
      lastPage = shown;
      append({ kind: 'page_view', page: shown, atMillis: time() });
      enqueue();
    }
    if (interactive) { clock?.interact(env.mono()); lastActive = env.mono(); }
    clock?.configure(true, 'other');
  };
  const foregroundChanged = () => { clock?.stopProgress(); sample(); expire(); show(false, true); flush(); };

  return {
    start() {
      for (const name of INPUT_EVENTS) detach.push(env.on(name, event => {
        if (!event.isTrusted || !visible() || !shown) return;
        sample(); expire(); show(true);
      }));
      for (const name of ['visibilitychange', 'blur', 'focus', 'pagehide', 'pageshow']) detach.push(env.on(name, () => {
        if (name === 'blur' || name === 'focus') blurry = name === 'blur';
        if (name === 'pagehide' || name === 'pageshow') pageSuspended = name === 'pagehide';
        foregroundChanged();
      }));
      detach.push(env.on('posetek:usage-workout', event => {
        if (visible() && shown === 'training' && event.detail?.active === true) {
          if (!visit) show(true);
          clock?.progress('workout', env.mono());
        } else clock?.stopProgress('workout');
      }));
      detach.push(env.on('online', send));
      detach.push(env.every(1000, () => {
        if (visible() && shown && shown !== 'settings' && env.progressingVideo()) {
          if (!visit) show(true);
          clock?.progress('video', env.mono());
        }
        sample(); expire(); show(false); send();
      }));
      detach.push(env.every(FLUSH_MS, flush));
      detach.push(env.every(60000, () => { if (eligible()) void queue.recover().then(send); }));
      void queue.start().then(send);
    },
    show(page: JourneyPage | null) {
      sample(); expire();
      if (shown !== page) clock?.stopProgress();
      shown = page; show(false);
    },
    click(target: JourneyTarget) {
      if (!visible() || !shown) return;
      sample(); expire(); show(true);
      append({ kind: 'click', page: shown, target, atMillis: time() });
    },
    outcome(target: JourneyOutcome) {
      if (!visible() || !visit || !shown) return undefined;
      const source = { visit, page: shown };
      return () => {
        if (!eligible() || visit !== source.visit) return;
        sample();
        append({ kind: 'outcome', page: source.page, target, atMillis: time() });
      };
    },
    leave(reason: ExitReason) {
      sample(); expire();
      if (eligible() && visit && lastPage) append({ kind: 'exit', page: lastPage, reason, atMillis: time() });
      flush();
      shown = null; lastPage = null; visit = null; clock = null;
    },
    close() {
      sample(); flush();
      closed = true; delivery.close(); detach.forEach(stop => stop()); queue.close();
    },
  };
}
