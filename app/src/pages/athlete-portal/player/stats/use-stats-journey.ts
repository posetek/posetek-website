import { useEffect, useMemo } from 'react';
import { auth, cloud } from '../../../../lib/firebase';
import { createStatsJourney, journeyTracked, newVisitId } from './stats-journey';
import type { JourneyButton, JourneyPlace, JourneyResponse, StatsJourney } from './stats-journey';

// One journey per page session, so "where from" and follow-through survive the workspace
// remounting (another page of the site, a different athlete). Created on the first tracked showing.
let journey: StatsJourney | null = null;
let closing: object | null = null;
/** Measurement never breaks the page (an old browser, a missing API): it just records nothing. */
const quietly = (action: () => void) => { try { action(); } catch { /* nothing recorded */ } };

/** The signed-in account, compared by the tracker to notice a sign-out or another account. Never sent. */
const actor = () => auth.currentUser?.uid ?? null;

function browserJourney(): StatsJourney {
  journey ??= createStatsJourney({
    // Landings name JOURNEY_BUILD, the usage tracker's build label. Best effort: the tracker swallows
    // every failure and never retries. Signed out, the server would refuse the request, and under another
    // account (signed in from another tab) it would not be this visit's: neither is sent.
    send: async (payload, account) => auth.currentUser?.uid === account ? (await cloud.httpsCallable('recordStatsJourney')(payload)).data as JourneyResponse : null,
    env: {
      wall: Date.now, mono: () => performance.now(), newId: () => newVisitId(),
      visible: () => document.visibilityState === 'visible',
      // These run on every tap, key and scroll and once a second, outside React: each is guarded on its own.
      on: (name, listener) => {
        const target = name === 'visibilitychange' ? document : window;
        const callback = (event: Event) => quietly(() => listener({ isTrusted: event.isTrusted }));
        target.addEventListener(name, callback, { passive: true, capture: true });
        return () => target.removeEventListener(name, callback, true);
      },
      every: (milliseconds, action) => { const id = setInterval(() => quietly(action), milliseconds); return () => clearInterval(id); },
    },
  });
  return journey;
}

/** Follow-through (a coach message, a plan request, a workout begun), credited to the latest Stats visit if any. */
export function reportStatsJourneyOutcome(kind: JourneyButton, playerId: string) {
  quietly(() => journey?.outcome(kind, playerId));
}

export type StatsJourneyHandle = {
  /** The next-step section: "reached" once at least half of it is in the viewport. */
  nextRef(node: HTMLElement | null): void | (() => void);
  /** A next-step button was pressed; call before navigating. */
  clicked(button: JourneyButton): void;
  /** The tab bar is about to change the page. */
  tabs(): void;
};

/** The workspace reports what it shows; the journey turns that into visits. Rendering never waits on it. */
export function useStatsJourney({ access, playerId, search, place }: { access: string; playerId: string | null; search: string; place: JourneyPlace }): StatsJourneyHandle {
  const tracked = journeyTracked(access, playerId, search);
  useEffect(() => {
    closing = null;
    if (tracked || journey) quietly(() => browserJourney().show({ tracked, playerId, place, actor: actor() }));
  }, [tracked, playerId, place]);
  // Leaving the workspace ends the visit; after a sign-out it is dropped unsent instead. Deferred so a
  // development remount (StrictMode) is not a visit.
  useEffect(() => () => {
    const token = closing = {};
    queueMicrotask(() => { if (closing === token) quietly(() => journey?.show({ tracked: false, playerId: null, place: 'other', actor: actor() })); });
  }, []);
  return useMemo(() => ({
    nextRef: node => {
      if (!node || typeof IntersectionObserver !== 'function') return;
      let observer: IntersectionObserver | null = null;
      quietly(() => {
        observer = new IntersectionObserver(entries => {
          const entry = entries[entries.length - 1];
          quietly(() => journey?.reach(!!entry?.isIntersecting && entry.intersectionRatio >= 0.5));
        }, { threshold: [0, 0.5] });
        observer.observe(node);
      });
      return () => { observer?.disconnect(); quietly(() => journey?.reach(false)); };
    },
    clicked: button => quietly(() => journey?.clicked(button)),
    tabs: () => quietly(() => journey?.via('tabs')),
  }), []);
}
