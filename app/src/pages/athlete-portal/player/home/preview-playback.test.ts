import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: {}, db: {}, cloud: {}, storage: {} }));
import { COPY } from './home-feed';
import { initialPreviewPlayback, previewReducer, unavailableIds } from './preview-playback';
import type { PreviewAction, PreviewPlayback } from './preview-playback';

const run = (actions: PreviewAction[], from: PreviewPlayback = initialPreviewPlayback) => actions.reduce(previewReducer, from);
const playing = () => run([
  { type: 'select', id: 'a' },
  { type: 'loaded', id: 'a', request: 1, result: { kind: 'playable', url: 'https://video/a' } },
  { type: 'ready', id: 'a' },
]);

describe('Silent feed preview (V4FeedPlayback)', () => {
  it('starts one load for a newly selected card and plays once the video can play', () => {
    const state = playing();
    expect(state).toMatchObject({ activeId: 'a', request: 1, refresh: false, urls: { a: 'https://video/a' }, states: { a: { kind: 'ready' } } });
  });
  it('never restarts the playing card when the list grows ("Load more activity") or the page scrolls', () => {
    const before = playing();
    // The same card is the candidate again after the list changes: nothing changes, no new load.
    const after = run([{ type: 'select', id: 'a' }, { type: 'select', id: 'a' }], before);
    expect(after).toBe(before);
    expect(after.states.a).toEqual({ kind: 'ready' });
    expect(after.request).toBe(1);
  });
  it('ignores a late answer for an older request or another card', () => {
    const moved = run([{ type: 'select', id: 'b' }], playing());
    expect(moved.request).toBe(2);
    const stale = run([{ type: 'loaded', id: 'a', request: 1, result: { kind: 'failed', message: 'late' } },
      { type: 'loaded', id: 'b', request: 1, result: { kind: 'noVideo' } }], moved);
    expect(stale).toBe(moved);
  });
  it('waits for a current link when a card becomes active again', () => {
    const back = run([{ type: 'select', id: null }, { type: 'select', id: 'a' }], playing());
    expect(back).toMatchObject({ activeId: 'a', request: 2, states: { a: { kind: 'loading' } } });
    expect(back.urls.a).toBeUndefined();
  });
  it('marks a card without video unavailable and a failed load or timeout as failed; retry refreshes the link', () => {
    const none = run([{ type: 'select', id: 'a' }, { type: 'loaded', id: 'a', request: 1, result: { kind: 'noVideo' } }]);
    expect(unavailableIds(none)).toEqual(new Set(['a']));
    const timedOut = run([{ type: 'select', id: 'a' }, { type: 'loaded', id: 'a', request: 1, result: { kind: 'playable', url: 'u' } }, { type: 'timeout', id: 'a' }]);
    expect(timedOut.states.a).toEqual({ kind: 'failed', message: COPY.videoLoadFailed });
    expect(run([{ type: 'timeout', id: 'a' }], playing()).states.a).toEqual({ kind: 'ready' });
    const retried = run([{ type: 'retry', id: 'a' }], timedOut);
    expect(retried).toMatchObject({ request: 2, refresh: true, states: { a: { kind: 'loading' } } });
    expect(retried.urls.a).toBeUndefined();
    expect(run([{ type: 'retry', id: 'z' }], timedOut)).toBe(timedOut);
  });
  it('remembers a manual pause or play per card', () => {
    expect(run([{ type: 'toggle', id: 'a', paused: false }], playing()).manual).toEqual({ a: 'paused' });
    expect(run([{ type: 'toggle', id: 'a', paused: true }], playing()).manual).toEqual({ a: 'playing' });
  });
});
