import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { callSocial } from '../../../feed/api';
import { formatDate, initials, mergeActivities } from '../../../feed/model';
import type { SocialComment, TimeCursor } from '../../../feed/contracts';
import {
  BENCHMARK_REFERENCE, COPY, EMPTY_MESSAGE, audienceLabel, barFractions, benchmarkRating, chartLabel, displayMetrics,
  errorMessage, errorStatus, formatNumber, outdoorPaths, shownBars, subtitleText, visibilityCandidate,
} from './home-feed';
import type { HomeActivity, HomeFeed, MediaLoad } from './home-feed';

const Icon = ({ name, filled = false }: { name: string; filled?: boolean }) =>
  <span className={`material-symbols-outlined${filled ? ' home-filled' : ''}`} aria-hidden="true">{name}</span>;

/** `V4LoadingRow`: the pulsing loader and a caption. */
export function LoadingRow({ text }: { text: string }) {
  return <p className="home-loading-row" role="status"><span className="home-loader" aria-hidden="true"><Icon name="progress_activity" /></span>{text}</p>;
}

/** `v4StateCard`: the gate, refusal and failure states, each with Retry. */
export function StateCard({ kind, message, onRetry }: { kind: 'error' | 'gated' | 'refused'; message: string; onRetry: () => void }) {
  return <div className="v4-card home-state">
    {kind === 'error' ? <>
      <span className="home-state-icon home-state-error"><Icon name="sync_problem" /></span>
      <h3 className="home-state-title">Let’s Try That<br />Again.</h3>
    </> : <span className={`home-state-icon${kind === 'refused' ? ' home-state-muted' : ''}`}><Icon name={kind === 'gated' ? 'groups' : 'lock'} filled /></span>}
    <p className="home-state-message">{message}</p>
    <button type="button" className="primary-cta" onClick={onRetry}>Retry</button>
  </div>;
}

function LoadingState() {
  return <div className="home-loading">
    <LoadingRow text={COPY.loadingFeed} />
    {[0, 1].map(index => <div className="v4-card home-skeleton" aria-hidden="true" key={index}>
      <i className="home-skeleton-avatar" /><i className="home-skeleton-line" /><i className="home-skeleton-line short" /><i className="home-skeleton-media" />
    </div>)}
  </div>;
}

function EmptyState() {
  return <div className="v4-card home-empty">
    <span className="home-empty-art"><Icon name="diversity_3" /></span>
    <h3>Your People.<br />Your Progress.</h3>
    <p>{EMPTY_MESSAGE}</p>
  </div>;
}

/** `SocialRepBarChart`: rep-by-rep bars, the latest one solid. */
function RepBars({ values }: { values: number[] }) {
  const shown = shownBars(values), fractions = barFractions(shown);
  return <div className="home-bars" role="img" aria-label={chartLabel(shown)}>
    <div className="home-bars-heading"><span>EVERY REP COUNTS</span><Icon name="trending_up" /></div>
    <div className={`home-bars-plot${shown.length > 20 ? ' dense' : ''}`}>
      {fractions.map((fraction, index) => <i key={index} className={index === fractions.length - 1 ? 'latest' : undefined} style={{ height: `${fraction * 100}%` }} />)}
    </div>
    <div className="home-bars-footer"><span>Rep by rep</span><span>{shown.length} recorded results</span></div>
  </div>;
}

/** `OutdoorGraphicView`: a neutral, unitless route outline without map, labels or endpoints. */
function OutdoorGraphic({ lines }: { lines: number[][][] }) {
  const paths = outdoorPaths(lines), points = paths.flat();
  if (!points.length) return null;
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(1, maxX - minX, maxY - minY) * 0.15 + 0.5;
  const box = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  return <svg className="home-route" viewBox={box} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Simplified route drawing with endpoints hidden">
    {paths.filter(line => line.length > 1).map((line, index) => <polyline key={index} points={line.map(point => point.join(',')).join(' ')} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

// MARK: - Silent previews (`V4FeedPlayback`): one muted preview plays, the one nearest the middle of the screen.

type PreviewState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'unavailable' } | { kind: 'failed'; message: string };

function usePreviewPlayback(ids: string[], enabled: boolean, load: (id: string, refresh: boolean) => Promise<MediaLoad>) {
  const elements = useRef(new Map<string, HTMLElement>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, PreviewState>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, 'paused' | 'playing'>>({});
  const statesRef = useRef(states); statesRef.current = states;
  const idsKey = ids.join('|');
  const select = useCallback(() => {
    if (!enabled) { setActiveId(null); return; }
    const frames: Record<string, { top: number; height: number; width: number; visibleArea: number }> = {};
    const height = window.innerHeight;
    for (const id of idsKey ? idsKey.split('|') : []) {
      const rect = elements.current.get(id)?.getBoundingClientRect();
      if (!rect) continue;
      const visibleHeight = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
      frames[id] = { top: rect.top, height: rect.height, width: rect.width, visibleArea: visibleHeight * rect.width };
    }
    const excluded = new Set(Object.entries(statesRef.current).filter(([, state]) => state.kind === 'unavailable').map(([id]) => id));
    setActiveId(visibilityCandidate(frames, height / 2, excluded));
  }, [enabled, idsKey]);
  useEffect(() => {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(select); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [select]);
  const begin = useCallback((id: string, refresh: boolean) => {
    let current = true;
    setStates(old => ({ ...old, [id]: { kind: 'loading' } }));
    void load(id, refresh).then(result => {
      if (!current) return;
      if (result.kind === 'playable') setUrls(old => ({ ...old, [id]: result.url }));
      else if (result.kind === 'noVideo') { setStates(old => ({ ...old, [id]: { kind: 'unavailable' } })); requestAnimationFrame(select); }
      else setStates(old => ({ ...old, [id]: { kind: 'failed', message: result.message } }));
    });
    return () => { current = false; };
  }, [load, select]);
  useEffect(() => { if (activeId) return begin(activeId, false); }, [activeId, begin]);
  // The video must report it can play within 20 seconds, or the preview says it could not load.
  useEffect(() => {
    if (!activeId || !urls[activeId] || states[activeId]?.kind !== 'loading') return;
    const id = activeId, timer = setTimeout(() => setStates(old => old[id]?.kind === 'loading' ? { ...old, [id]: { kind: 'failed', message: COPY.videoLoadFailed } } : old), 20_000);
    return () => clearTimeout(timer);
  }, [activeId, urls, states]);
  return {
    activeId, states, urls, manual,
    register: (id: string) => (element: HTMLElement | null) => { if (element) elements.current.set(id, element); else elements.current.delete(id); },
    ready: (id: string) => setStates(old => ({ ...old, [id]: { kind: 'ready' } })),
    fail: (id: string) => setStates(old => ({ ...old, [id]: { kind: 'failed', message: COPY.videoLoadFailed } })),
    retry: (id: string) => { setUrls(old => { const next = { ...old }; delete next[id]; return next; }); begin(id, true); },
    toggle: (id: string, paused: boolean) => setManual(old => ({ ...old, [id]: paused ? 'playing' : 'paused' })),
  };
}
type Playback = ReturnType<typeof usePreviewPlayback>;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** `V4FeedVideoPreview`: 263 points tall; tapping it opens the saved rep. */
function VideoPreview({ id, playback, enabled, onOpen }: { id: string; playback: Playback; enabled: boolean; onOpen: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const state = playback.states[id], active = playback.activeId === id, url = active ? playback.urls[id] : undefined;
  const reduce = prefersReducedMotion();
  const shouldPlay = enabled && active && state?.kind === 'ready' && playback.manual[id] !== 'paused' && (!reduce || playback.manual[id] === 'playing');
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = true;
    if (shouldPlay) void element.play().catch(() => { /* a refused autoplay leaves the play control */ });
    else element.pause();
  }, [shouldPlay, url]);
  if (state?.kind === 'unavailable') return null;
  return <div className="home-video" ref={playback.register(id)}>
    {url && <video ref={video} src={url} muted playsInline loop preload="auto" aria-hidden="true" tabIndex={-1}
      onCanPlay={() => { if (state?.kind === 'loading') playback.ready(id); }} onError={() => playback.fail(id)} />}
    <button type="button" className="home-video-open" aria-label="Open saved rep" onClick={onOpen} />
    {active && state?.kind === 'loading' && <p className="home-video-status" role="status"><span className="home-spinner" aria-hidden="true" />Loading video…</p>}
    {active && state?.kind === 'failed' && <div className="home-video-failed">
      <p>{state.message}</p>
      <button type="button" onClick={() => playback.retry(id)}>Retry video</button>
    </div>}
    {active && state?.kind === 'ready' && <button type="button" className="home-video-toggle" aria-label={shouldPlay ? 'Pause preview' : 'Play preview'} onClick={() => playback.toggle(id, !shouldPlay)}>
      <Icon name={shouldPlay ? 'pause' : 'play_arrow'} filled />
    </button>}
    {!active && <span className="home-video-idle"><Icon name="play_arrow" filled /></span>}
  </div>;
}

/** `V4SocialActivityCard`. */
function ActivityCard({ activity, busy, error, notice, preview, onKudos, onComment }: {
  activity: HomeActivity; busy: boolean; error?: string; notice?: string; preview: ReactNode;
  onKudos: () => void; onComment: () => void;
}) {
  const metrics = displayMetrics(activity).slice(0, 3);
  const graphic = activity.outdoorGraphic;
  return <article className="v4-card home-card">
    <div className="home-card-author">
      <span className="home-avatar" aria-hidden="true">{initials(activity.authorName)}</span>
      <div>
        <strong>{activity.authorName}</strong>
        <span className="home-caption">{[activity.teamName, formatDate(activity.occurredAt)].filter(Boolean).join(' · ')}</span>
        <span className="home-caption home-audience"><Icon name="group" />{audienceLabel(activity)}</span>
      </div>
    </div>
    <div className="home-card-title">
      <h3>{activity.title}</h3>
      <p>{subtitleText(activity)}</p>
    </div>
    {metrics.length > 0 && <div className="home-metrics" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
      {metrics.map(metric => <div key={metric.label}>
        <span className="home-caption">{metric.label}</span>
        <span className="home-metric-value"><strong>{formatNumber(metric.value, metric.unit)}</strong>{metric.unit && <small>{metric.unit}</small>}</span>
      </div>)}
    </div>}
    {graphic && graphic.length ? <OutdoorGraphic lines={graphic} /> : activity.canViewVideo ? preview : activity.chart.length ? <RepBars values={activity.chart} /> : null}
    {activity.score !== null && <p className="home-benchmark"><Icon name="bar_chart" /><span><strong>{benchmarkRating(activity.score)}</strong>{BENCHMARK_REFERENCE}</span></p>}
    {notice && <p className="home-caption" role="status">{notice}</p>}
    <div className="home-card-actions">
      <button type="button" disabled={busy} aria-pressed={activity.liked} aria-label={`Kudos, ${activity.kudos}`} onClick={onKudos}>
        <Icon name="thumb_up" filled={activity.liked} />{activity.kudos}
      </button>
      <button type="button" aria-label={`Comments, ${activity.comments}`} onClick={onComment}><Icon name="chat_bubble" />{activity.comments}</button>
    </div>
    {error && <p className="home-card-error" role="alert">{error}</p>}
  </article>;
}

// MARK: - Sheets

function Sheet({ title, onClose, closeLabel, children, className = '' }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className={`home-sheet ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="home-sheet-body">
      <header className="home-sheet-header"><h2>{title}</h2><button type="button" onClick={onClose}>{closeLabel}</button></header>
      {children}
    </div>
  </dialog>;
}

const COMMENT_LIMIT = 1000, COMMENT_THROTTLE_MS = 2000;

/** `SocialCommentsView` and `SocialCommentsModel`: 30 a page, Delete where allowed, a 1000-character composer and the server's 2 s throttle. */
function CommentsSheet({ activityId, sample, onChanged, onClose }: { activityId: string; sample: boolean; onChanged: () => Promise<void>; onClose: () => void }) {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [cursor, setCursor] = useState<TimeCursor | null>(null);
  const [loaded, setLoaded] = useState(sample), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [draft, setDraft] = useState(''), [coolingDown, setCoolingDown] = useState(false);
  const pending = useRef<{ id: string; text: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const page = useCallback(async (from: TimeCursor | null) => {
    const result = await callSocial('getSocialComments', { id: activityId, cursor: from });
    if (!alive.current) return;
    setComments(old => from ? mergeActivities(old, result.items) : result.items); setCursor(result.cursor); setLoaded(true);
  }, [activityId]);
  const read = useCallback(async (from: TimeCursor | null) => {
    if (sample) return;
    setLoading(true); setError(null);
    try { await page(from); } catch (e) { if (alive.current) setError(errorMessage(e)); }
    if (alive.current) setLoading(false);
  }, [page, sample]);
  useEffect(() => { void read(null); }, [read]);
  const cooldown = () => { setCoolingDown(true); setTimeout(() => { if (alive.current) setCoolingDown(false); }, COMMENT_THROTTLE_MS); };
  const afterChange = async () => {
    try { await page(null); } catch (e) { if (alive.current) setError(errorMessage(e)); }
    await onChanged();
  };
  const canSend = !busy && !!draft.trim() && !coolingDown;
  const post = async () => {
    if (!canSend) return;
    if (sample) { setError('Sample preview. Sign in to interact with real activity.'); return; }
    const text = draft;
    const commentId = pending.current?.text === text ? pending.current.id : crypto.randomUUID().toLowerCase();
    pending.current = { id: commentId, text };
    setBusy(true); setError(null);
    try { await callSocial('saveSocialComment', { id: activityId, commentId, text }); }
    catch (e) {
      if (!alive.current) return;
      if (errorStatus(e) === 'RESOURCE_EXHAUSTED') cooldown();
      setError(errorMessage(e)); setBusy(false); return;
    }
    if (!alive.current) return;
    cooldown(); pending.current = null; setDraft('');
    await afterChange();
    if (alive.current) setBusy(false);
  };
  const remove = async (comment: SocialComment) => {
    if (!comment.canDelete || busy) return;
    setBusy(true); setError(null);
    try { await callSocial('saveSocialComment', { id: activityId, commentId: comment.id, remove: true }); await afterChange(); }
    catch (e) { if (alive.current) setError(errorMessage(e)); }
    if (alive.current) setBusy(false);
  };
  return <Sheet title="Comments" closeLabel="Close" onClose={onClose}>
    <div className="home-comments">
      {loading && !loaded ? <LoadingRow text="Loading comments…" /> : loaded && !comments.length ? <p className="home-secondary">{COPY.noComments}</p> : null}
      {comments.map(comment => <div className="home-comment" key={comment.id}>
        <div><strong>{comment.name}</strong>{comment.canDelete && <button type="button" className="home-text-button" disabled={busy} onClick={() => void remove(comment)}>Delete</button>}</div>
        <p>{comment.text}</p>
        <span className="home-caption">{formatDate(comment.createdAt)}</span>
      </div>)}
      {cursor && <button type="button" className="home-text-button home-more" disabled={loading || busy} onClick={() => void read(cursor)}>{COPY.moreComments}</button>}
    </div>
    {error && <p className="home-card-error" role="alert">{error}</p>}
    <form className="home-composer" onSubmit={event => { event.preventDefault(); void post(); }}>
      <textarea aria-label={COPY.addComment} placeholder={COPY.addComment} rows={1} maxLength={COMMENT_LIMIT} value={draft} disabled={busy}
        onChange={event => { const text = event.target.value; if (pending.current && pending.current.text !== text) pending.current = null; setDraft(text); }} />
      <button type="submit" aria-label={COPY.postComment} disabled={!canSend}><Icon name={busy ? 'progress_activity' : 'arrow_upward'} /></button>
      {draft.length > COMMENT_LIMIT - 100 && <span className="home-caption home-count">{draft.length} / {COMMENT_LIMIT}</span>}
    </form>
  </Sheet>;
}

/** `SocialMediaPlayerSheet`: plays the signed link; a failure asks for a fresh one. */
function MediaSheet({ title, url, reload, onClose }: { title: string; url: string; reload: () => Promise<MediaLoad>; onClose: () => void }) {
  const [source, setSource] = useState(url);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'playing' } | { kind: 'noVideo' } | { kind: 'failed'; message: string }>({ kind: 'loading' });
  useEffect(() => {
    if (state.kind !== 'loading') return;
    const timer = setTimeout(() => setState(old => old.kind === 'loading' ? { kind: 'failed', message: COPY.videoLoadFailed } : old), 20_000);
    return () => clearTimeout(timer);
  }, [state.kind, source]);
  const retry = async () => {
    setState({ kind: 'loading' });
    const result = await reload();
    if (result.kind === 'playable') setSource(result.url);
    else setState(result.kind === 'noVideo' ? { kind: 'noVideo' } : { kind: 'failed', message: result.message });
  };
  return <Sheet title={title} closeLabel="Done" onClose={onClose} className="home-media-sheet">
    <div className="home-media">
      {(state.kind === 'loading' || state.kind === 'playing') && <video key={source} src={source} controls autoPlay playsInline
        onCanPlay={() => setState(old => old.kind === 'loading' ? { kind: 'playing' } : old)} onError={() => setState({ kind: 'failed', message: COPY.videoUnavailable })} />}
      {state.kind === 'loading' && <span className="home-spinner home-media-spinner" role="status" aria-label="Loading video" />}
      {state.kind === 'noVideo' && <div className="home-media-message"><Icon name="videocam_off" /><p>{COPY.noSavedVideo}</p></div>}
      {state.kind === 'failed' && <div className="home-media-message"><Icon name="warning" filled /><p>{state.message}</p>
        <button type="button" className="home-media-retry" onClick={() => void retry()}><Icon name="play_circle" />Watch saved rep</button></div>}
    </div>
  </Sheet>;
}

// MARK: - Feed

/** The ready feed: cards, "Loading activity…", a failed page, the empty state, "Load more activity" and "You’re all caught up". */
export function FeedList({ feed, active, sample }: { feed: HomeFeed; active: boolean; sample: boolean }) {
  const [sheet, setSheet] = useState<{ kind: 'comments'; id: string } | { kind: 'media'; id: string; title: string; url: string } | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [watching, setWatching] = useState<Set<string>>(new Set());
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  useEffect(() => {
    const changed = () => setForeground(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const previewsEnabled = active && foreground && sheet === null;
  const videoIds = feed.activities.filter(activity => activity.canViewVideo && !activity.outdoorGraphic?.length).map(activity => activity.id);
  const playback = usePreviewPlayback(videoIds, previewsEnabled, feed.loadMedia);
  const watch = async (activity: HomeActivity) => {
    if (watching.has(activity.id)) return;
    setNotices(old => { const next = { ...old }; delete next[activity.id]; return next; });
    setErrors(old => { const next = { ...old }; delete next[activity.id]; return next; });
    setWatching(old => new Set(old).add(activity.id));
    const result = await feed.loadMedia(activity.id, false);
    setWatching(old => { const next = new Set(old); next.delete(activity.id); return next; });
    if (result.kind === 'playable') setSheet({ kind: 'media', id: activity.id, title: activity.title, url: result.url });
    else if (result.kind === 'noVideo') setNotices(old => ({ ...old, [activity.id]: COPY.noSavedVideo }));
    else setErrors(old => ({ ...old, [activity.id]: result.message }));
  };
  const caughtUp = feed.activities.length > 0 && !feed.cursor && !feed.loadingFeed;
  const empty = !feed.activities.length && !feed.loadingFeed && !feed.feedError;
  return <>
    {feed.activities.map(activity => <ActivityCard key={activity.id} activity={activity}
      busy={feed.busy.has(activity.id) || watching.has(activity.id)} error={feed.cardErrors[activity.id] ?? errors[activity.id]} notice={notices[activity.id]}
      onKudos={() => feed.toggleKudos(activity.id)} onComment={() => setSheet({ kind: 'comments', id: activity.id })}
      preview={<VideoPreview id={activity.id} playback={playback} enabled={previewsEnabled} onOpen={() => void watch(activity)} />} />)}
    {feed.loadingFeed && <div className="home-status-row"><LoadingRow text={COPY.loadingActivity} /></div>}
    {feed.feedError && <StateCard kind="error" message={feed.feedError} onRetry={feed.retryFeed} />}
    {empty && <EmptyState />}
    {feed.cursor && <button type="button" className="home-load-more" disabled={feed.loadingFeed} onClick={feed.loadMore}>{COPY.loadMore}</button>}
    {caughtUp && <p className="home-caught-up">{COPY.caughtUp}</p>}
    {sheet?.kind === 'comments' && <CommentsSheet activityId={sheet.id} sample={sample} onChanged={() => feed.refreshActivity(sheet.id)} onClose={() => setSheet(null)} />}
    {sheet?.kind === 'media' && <MediaSheet title={sheet.title} url={sheet.url} reload={() => feed.loadMedia(sheet.id, true)} onClose={() => setSheet(null)} />}
  </>;
}

export { LoadingState };
