import { COPY } from './home-feed';
import type { MediaLoad } from './home-feed';

/**
 * The silent feed preview's state (the app's `V4FeedPlayback`) as a reducer, so the rules are
 * testable without a browser. One card is active at a time; `request` counts the loads the
 * active card has started. Re-selecting the card that is already active (a scroll, a resize or
 * "Load more activity" changing the list) changes nothing, so a playing preview never restarts.
 */
export type PreviewState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'unavailable' } | { kind: 'failed'; message: string };

export type PreviewPlayback = {
  activeId: string | null;
  /** Increases when the active card needs a new media load: a newly selected card or a retry. */
  request: number;
  /** Whether that load should bypass the cached link (a retry). */
  refresh: boolean;
  states: Record<string, PreviewState>;
  urls: Record<string, string>;
  manual: Record<string, 'paused' | 'playing'>;
};

export type PreviewAction =
  | { type: 'select'; id: string | null }
  | { type: 'loaded'; id: string; request: number; result: MediaLoad }
  | { type: 'ready'; id: string }
  | { type: 'failed'; id: string }
  | { type: 'timeout'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'toggle'; id: string; paused: boolean };

export const initialPreviewPlayback: PreviewPlayback = { activeId: null, request: 0, refresh: false, states: {}, urls: {}, manual: {} };

const without = <T,>(record: Record<string, T>, id: string) => { const next = { ...record }; delete next[id]; return next; };

export function previewReducer(state: PreviewPlayback, action: PreviewAction): PreviewPlayback {
  switch (action.type) {
    case 'select': {
      if (action.id === state.activeId) return state;
      if (action.id === null) return { ...state, activeId: null };
      // A newly active card waits for a current link: an older one may have expired.
      return { ...state, activeId: action.id, request: state.request + 1, refresh: false,
        states: { ...state.states, [action.id]: { kind: 'loading' } }, urls: without(state.urls, action.id) };
    }
    case 'retry':
      if (action.id !== state.activeId) return state;
      return { ...state, request: state.request + 1, refresh: true,
        states: { ...state.states, [action.id]: { kind: 'loading' } }, urls: without(state.urls, action.id) };
    case 'loaded': {
      // An answer for a card that is no longer active, or for an older request, is ignored.
      if (action.id !== state.activeId || action.request !== state.request) return state;
      const { result } = action;
      if (result.kind === 'playable') return { ...state, urls: { ...state.urls, [action.id]: result.url } };
      return { ...state, states: { ...state.states, [action.id]: result.kind === 'noVideo' ? { kind: 'unavailable' } : { kind: 'failed', message: result.message } } };
    }
    case 'ready':
      return state.states[action.id]?.kind === 'loading' ? { ...state, states: { ...state.states, [action.id]: { kind: 'ready' } } } : state;
    case 'failed':
      return { ...state, states: { ...state.states, [action.id]: { kind: 'failed', message: COPY.videoLoadFailed } } };
    case 'timeout':
      return state.states[action.id]?.kind === 'loading' ? { ...state, states: { ...state.states, [action.id]: { kind: 'failed', message: COPY.videoLoadFailed } } } : state;
    case 'toggle':
      return { ...state, manual: { ...state.manual, [action.id]: action.paused ? 'playing' : 'paused' } };
  }
}

/** Cards whose media turned out to have no video; the selection skips them. */
export const unavailableIds = (state: PreviewPlayback) =>
  new Set(Object.entries(state.states).filter(([, value]) => value.kind === 'unavailable').map(([id]) => id));
