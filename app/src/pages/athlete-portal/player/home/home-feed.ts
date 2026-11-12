import { useCallback, useEffect, useRef, useState } from 'react';
import { callSocial } from '../../../feed/api';
import { mergeActivities } from '../../../feed/model';
import type { SocialActivity, SocialContext, SocialMetric, TimeCursor } from '../../../feed/contracts';

/**
 * Home's organization activity: the app's `CommunityFeedViewModel` in workspace mode
 * (KickAI/Community/CommunityFeedViewModel.swift). It reuses the website feed's typed callables
 * (`feed/api.ts`), contracts and pagination merge; the presentation is the app's V4 card.
 */

/** Outdoor activities carry two fields the recovered web contracts predate. */
export type HomeActivity = SocialActivity & { outdoorActivity?: string | null; outdoorGraphic?: number[][][] | null };

export type FeedPhase =
  | { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' }
  | { kind: 'gated'; message: string } | { kind: 'refused'; message: string } | { kind: 'failed'; message: string };

export type MediaLoad = { kind: 'playable'; url: string } | { kind: 'noVideo' } | { kind: 'failed'; message: string };

// MARK: - Copy (the app's `CommunityCopy`)

export const COPY = {
  loadingFeed: 'Loading your feed…',
  loadingActivity: 'Loading activity…',
  loadMore: 'Load more activity',
  caughtUp: 'You’re all caught up. Time to put in the work.',
  noSavedVideo: 'No saved video is available for this rep.',
  videoUnavailable: 'Video link expired or unavailable. Tap Watch saved rep to retry.',
  videoLoadFailed: 'Couldn\'t load the video. Tap Watch saved rep to try again.',
  noComments: 'Start the encouragement.',
  moreComments: 'More comments',
  addComment: 'Add a comment',
  postComment: 'Post comment',
};

/** Every Home feed request reads the organization scope; the app shows no scope menu here. */
export const HOME_SCOPE = 'organization' as const;

/** `CommunityCopy.emptyMessage` for the organization scope. */
export const EMPTY_MESSAGE = 'Finished workouts and measured sessions will appear here as your community trains.';

// MARK: - Errors

export function errorStatus(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? '').split('/').at(-1) || '';
  return code.toUpperCase().replace(/-/g, '_');
}
export function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : String(error);
}

/** PS4: `FAILED_PRECONDITION` gates, `PERMISSION_DENIED` refuses, anything else fails. */
export function phaseForError(error: unknown): FeedPhase {
  const message = errorMessage(error);
  switch (errorStatus(error)) {
    case 'FAILED_PRECONDITION': return { kind: 'gated', message };
    case 'PERMISSION_DENIED': return { kind: 'refused', message };
    default: return { kind: 'failed', message };
  }
}

/** The feed is unavailable (so the recap lists recent workouts) when the flag is off or the context call did not succeed. */
export function feedUnavailable(enabled: boolean, phase: FeedPhase): boolean {
  return !enabled || phase.kind === 'gated' || phase.kind === 'refused' || phase.kind === 'failed';
}

/** `V4TabPolicy.feedEnabled` in a release build: only the remote `config/llm.communityFeedEnabled` boolean. */
export function remoteFeedEnabled(config: Record<string, unknown> | null): boolean {
  return config?.communityFeedEnabled === true;
}

// MARK: - Formatting (the app's `SocialFormat` and V4 card)

const METERS_PER_MILE = 1609.344;

/** `SocialFormat.number`: pace as m:ss, integers as they are, seconds to two decimals, others to one. */
export function formatNumber(value: number, unit: string): string {
  if ((unit === 'min/km' || unit === 'min/mile') && Number.isFinite(value) && value >= 0 && value <= (unit === 'min/km' ? 120 : 240)) {
    const seconds = Math.round(value * 60);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(unit === 's' ? 2 : 1);
}

/** `SocialActivity.displayMetrics`: outdoor activities keep server units on the wire and show miles. */
export function displayMetrics(activity: HomeActivity): SocialMetric[] {
  if (activity.outdoorActivity == null) return activity.metrics;
  return activity.metrics.map(metric => {
    switch (metric.unit) {
      case 'km': return { ...metric, value: metric.value * 1000 / METERS_PER_MILE, unit: 'mi' };
      case 'km/h': return { ...metric, value: metric.value * 1000 / METERS_PER_MILE, unit: 'mph' };
      case 'min/km': return { ...metric, value: metric.value * METERS_PER_MILE / 1000, unit: 'min/mile' };
      default: return metric;
    }
  });
}

const AUDIENCE_LABELS: Record<string, string> = { organization: 'Organization + friends', team: 'Team only', friends: 'Friends only', private: 'Only me' };
export function audienceLabel(activity: HomeActivity): string {
  return activity.outdoorActivity != null && activity.audience === 'organization' ? 'My organization' : AUDIENCE_LABELS[activity.audience] ?? activity.audience;
}

export const subtitleText = (activity: SocialActivity) => activity.subtitle + (activity.partial ? ' · Finished with partial work' : '');
export const benchmarkRating = (score: number) => `${Math.round(score)} benchmark rating`;
export const BENCHMARK_REFERENCE = ' · 100 = reference median for this metric';

/** `SocialRepBarChart`: the last 30 values, each at least 8 % of the chart and at most all of it. */
export const MAX_BARS = 30;
export function shownBars(values: number[]): number[] { return values.slice(-MAX_BARS); }
export function barFractions(values: number[]): number[] {
  const finite = values.filter(Number.isFinite);
  const maximum = Math.max(finite.length ? Math.max(...finite) : 1, 1);
  return values.map(value => Number.isFinite(value) ? Math.min(1, Math.max(0.08, value / maximum)) : 0.08);
}
export const chartLabel = (values: number[]) => `Last ${values.length} rep results: ${values.map(value => value.toFixed(1)).join(', ')}`;

/** `OutdoorGraphicView`: at most four lines of 24 points on a 0–31 grid, endpoints already removed by the app. */
export function outdoorPaths(lines: number[][][]): number[][][] {
  return lines.slice(0, 4).map(line => line.slice(0, 24).filter(point => point.length === 2 && point.every(value => Number.isInteger(value) && value >= 0 && value <= 31)));
}

/** `V4FeedVisibility.candidate`: the eligible preview at least half on screen whose middle is nearest the viewport's. */
export function visibilityCandidate(frames: Record<string, { top: number; height: number; width: number; visibleArea: number }>, viewportMid: number, excluded: Set<string>): string | null {
  let best: string | null = null, bestDistance = Infinity;
  for (const [id, frame] of Object.entries(frames)) {
    if (excluded.has(id) || frame.width <= 0 || frame.height <= 0 || frame.visibleArea < frame.width * frame.height * 0.5) continue;
    const distance = Math.abs(frame.top + frame.height / 2 - viewportMid);
    if (distance < bestDistance || (distance === bestDistance && best !== null && id < best)) { best = id; bestDistance = distance; }
  }
  return best;
}

// MARK: - State

type Media = { url: string; expiresAt: number };
const MEDIA_REFRESH_MARGIN_MS = 20_000;
const MEDIA_TIMEOUT_MS = 25_000;

export type HomeFeed = {
  phase: FeedPhase;
  context: SocialContext | null;
  activities: HomeActivity[];
  cursor: TimeCursor | null;
  loadingFeed: boolean;
  feedError: string | null;
  busy: Set<string>;
  cardErrors: Record<string, string>;
  reload: () => void;
  retryFeed: () => void;
  loadMore: () => void;
  toggleKudos: (id: string) => void;
  loadMedia: (id: string, forceRefresh: boolean) => Promise<MediaLoad>;
  refreshActivity: (id: string) => Promise<void>;
};

/**
 * The feed loads the first time Home is on screen with the feed enabled, and again when the
 * signed-in account or athlete changes, as the app's `setVisible` does.
 */
export function useHomeFeed({ enabled, active, identity, sample: initial }: { enabled: boolean; active: boolean; identity: string; sample?: { phase: FeedPhase; activities: HomeActivity[]; context: SocialContext | null; cursor?: TimeCursor | null } }): HomeFeed {
  // The local preview's sample never calls the server; it is read once.
  const sample = !!initial;
  const [phase, setPhase] = useState<FeedPhase>(initial?.phase ?? { kind: 'idle' });
  const [context, setContext] = useState<SocialContext | null>(initial?.context ?? null);
  const [activities, setActivities] = useState<HomeActivity[]>(initial?.activities ?? []);
  const [cursor, setCursor] = useState<TimeCursor | null>(initial?.cursor ?? null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const contextGeneration = useRef(0), feedGeneration = useRef(0);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const failedCursor = useRef<TimeCursor | null>(null);
  const activated = useRef<string | null>(null);
  const media = useRef(new Map<string, Media>());
  const mediaRequests = useRef(new Map<string, { token: object; promise: Promise<MediaLoad> }>());
  const activitiesRef = useRef(activities); activitiesRef.current = activities;
  const busyRef = useRef(busy); busyRef.current = busy;

  const loadFeed = useCallback(async (requestCursor: TimeCursor | null) => {
    if (sample || phaseRef.current.kind !== 'ready') return;
    const generation = ++feedGeneration.current;
    setLoadingFeed(true); setFeedError(null); failedCursor.current = null;
    try {
      const page = await callSocial('getSocialFeed', { scope: HOME_SCOPE, cursor: requestCursor });
      if (generation !== feedGeneration.current) return;
      setActivities(old => requestCursor ? mergeActivities(old, page.items as HomeActivity[]) : page.items as HomeActivity[]);
      setCursor(page.cursor);
    } catch (error) {
      if (generation !== feedGeneration.current) return;
      setFeedError(errorMessage(error)); failedCursor.current = requestCursor;
    }
    setLoadingFeed(false);
  }, [sample]);

  const reload = useCallback(async () => {
    if (sample) return;
    const generation = ++contextGeneration.current;
    ++feedGeneration.current;
    setContext(null); setActivities([]); setCursor(null); setLoadingFeed(false); setFeedError(null);
    setBusy(new Set()); setCardErrors({}); failedCursor.current = null; media.current.clear(); mediaRequests.current.clear();
    setPhase({ kind: 'loading' }); phaseRef.current = { kind: 'loading' };
    let loaded: SocialContext;
    try { loaded = await callSocial('getSocialContext', {}); }
    catch (error) {
      if (generation === contextGeneration.current) setPhase(phaseForError(error));
      return;
    }
    if (generation !== contextGeneration.current) return;
    setContext(loaded); setPhase({ kind: 'ready' }); phaseRef.current = { kind: 'ready' };
    await loadFeed(null);
  }, [loadFeed, sample]);

  useEffect(() => {
    if (sample || !enabled || !active || activated.current === identity) return;
    activated.current = identity;
    void reload();
  }, [enabled, active, identity, reload, sample]);
  // A request that answers after Home has gone away is ignored.
  useEffect(() => () => { ++contextGeneration.current; ++feedGeneration.current; }, []);

  const replace = (id: string, change: (activity: HomeActivity) => HomeActivity) =>
    setActivities(old => old.map(activity => activity.id === id ? change(activity) : activity));

  const refreshActivity = useCallback(async (id: string) => {
    if (sample) return;
    const generation = contextGeneration.current;
    try {
      const fresh = await callSocial('getSocialActivity', { id });
      if (generation === contextGeneration.current) replace(id, () => fresh as HomeActivity);
    } catch { /* a failed refresh keeps the card as it is */ }
  }, [sample]);

  const toggleKudos = useCallback((id: string) => {
    const before = activitiesRef.current.find(activity => activity.id === id);
    if (!before || busyRef.current.has(id)) return;
    const liked = !before.liked, kudos = Math.max(0, before.kudos + (liked ? 1 : -1));
    replace(id, activity => ({ ...activity, liked, kudos }));
    // The local preview never writes: the change stays on this page.
    if (sample) return;
    const generation = contextGeneration.current;
    setBusy(old => new Set(old).add(id));
    setCardErrors(old => { const next = { ...old }; delete next[id]; return next; });
    const done = () => setBusy(old => { const next = new Set(old); next.delete(id); return next; });
    void callSocial('setSocialKudos', { id, liked }).then(async () => {
      if (generation !== contextGeneration.current) return;
      await refreshActivity(id); done();
    }, error => {
      if (generation !== contextGeneration.current) return;
      replace(id, current => current.liked === liked && current.kudos === kudos ? { ...current, liked: before.liked, kudos: before.kudos } : current);
      setCardErrors(old => ({ ...old, [id]: errorMessage(error) })); done();
    });
  }, [refreshActivity, sample]);

  const loadMedia = useCallback((id: string, forceRefresh: boolean): Promise<MediaLoad> => {
    if (forceRefresh) { media.current.delete(id); mediaRequests.current.delete(id); }
    const cached = media.current.get(id);
    if (cached && cached.expiresAt - Date.now() > MEDIA_REFRESH_MARGIN_MS) return Promise.resolve({ kind: 'playable', url: cached.url });
    const pending = mediaRequests.current.get(id);
    if (pending) return pending.promise;
    if (sample) return Promise.resolve({ kind: 'noVideo' });
    const token = {}, generation = contextGeneration.current;
    const deadline = new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('deadline'), { code: 'deadline-exceeded' })), MEDIA_TIMEOUT_MS));
    const promise = Promise.race([callSocial('getSocialMedia', { id }), deadline]).then((link): MediaLoad => {
      if (generation !== contextGeneration.current || mediaRequests.current.get(id)?.token !== token) return { kind: 'failed', message: COPY.videoUnavailable };
      if (!link.url) { media.current.delete(id); return { kind: 'noVideo' }; }
      if (link.expiresAt) media.current.set(id, { url: link.url, expiresAt: link.expiresAt });
      return { kind: 'playable', url: link.url };
    }, (error): MediaLoad => errorStatus(error) === 'DEADLINE_EXCEEDED' ? { kind: 'failed', message: COPY.videoLoadFailed } : { kind: 'failed', message: errorMessage(error) })
      .finally(() => { if (mediaRequests.current.get(id)?.token === token) mediaRequests.current.delete(id); });
    mediaRequests.current.set(id, { token, promise });
    return promise;
  }, [sample]);

  return {
    phase, context, activities, cursor, loadingFeed, feedError, busy, cardErrors,
    reload: () => { void reload(); },
    retryFeed: () => { void loadFeed(failedCursor.current); },
    loadMore: () => { if (cursor && !loadingFeed) void loadFeed(cursor); },
    toggleKudos, loadMedia, refreshActivity,
  };
}
