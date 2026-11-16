import { useLayoutEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { auth, cloud } from '../firebase';
import { browserClientKind, browserEngagementEnvironment } from '../insight-usage/browser';
import { browserUsageLocks, EngagementQueue, removeOtherActorQueues } from '../insight-usage/queue';
import type { UsageStorage } from '../insight-usage/queue';
import { createJourneyRecorder, isJourneyTarget, JOURNEY_QUEUE_PREFIX, validSavedJourneyBatch } from './recording';
import type { JourneyBatch, JourneyOutcome, JourneyPage } from './recording';
import { takePlayerJourneyEntry } from './entry';

type Recorder = ReturnType<typeof createJourneyRecorder>;
let current: { uid: string; playerId: string; recorder: Recorder } | undefined;

function quietly(action: () => void) {
  try { action(); } catch { /* Measurement must leave the player flow usable. */ }
}

export function playerJourneyOutcome(playerId: string, target: JourneyOutcome) {
  if (current?.playerId !== playerId || auth.currentUser?.uid !== current.uid) return undefined;
  try {
    const outcome = current.recorder.outcome(target);
    return outcome ? () => quietly(outcome) : undefined;
  } catch { return undefined; }
}

export function usePlayerJourney({ ownerUid, access, playerId, page, search }: {
  ownerUid?: string; access: string; playerId: string | null; page: JourneyPage | null; search: string;
}) {
  const optOut = new URLSearchParams(search);
  const eligible = access === 'athlete' && !!ownerUid && !!playerId
    && !['preview', 'share', 'viewAs', 'viewAsPlayerId'].some(key => optOut.has(key));
  const entrySearch = useRef(search);
  entrySearch.current = search;
  const pendingRemoval = useRef<(() => void) | null>(null);
  const active = useRef<Recorder | undefined>(undefined);

  useLayoutEffect(() => {
    const valid = eligible && !!ownerUid && !!playerId && auth.currentUser?.uid === ownerUid && !auth.currentUser?.isAnonymous;
    const same = valid && active.current && current?.recorder === active.current && current.uid === ownerUid && current.playerId === playerId;
    if (same) pendingRemoval.current = null; // StrictMode's immediate remount is the same showing.
    else {
      pendingRemoval.current?.();
      if (!valid || !ownerUid || !playerId) return;
      let storage: UsageStorage | undefined;
      try { storage = localStorage; } catch { /* Optional storage. */ }
      quietly(() => {
        removeOtherActorQueues(storage, ownerUid, JOURNEY_QUEUE_PREFIX);
        const queue = new EngagementQueue<JourneyBatch>(ownerUid, crypto.randomUUID(), storage, browserUsageLocks(), Date.now, JOURNEY_QUEUE_PREFIX, validSavedJourneyBatch);
        const recorder = createJourneyRecorder({
          uid: ownerUid, playerId, clientKind: browserClientKind(navigator), queue,
          environment: browserEngagementEnvironment(() => auth.currentUser?.uid),
          invoke: async batch => (await cloud.httpsCallable('recordPlayerJourney')(batch)).data as { accepted?: boolean; reason?: string },
          makeId: () => crypto.randomUUID(), firstEntry: () => takePlayerJourneyEntry(ownerUid, entrySearch.current),
        });
        recorder.start();
        active.current = recorder;
        current = { uid: ownerUid, playerId, recorder };
      });
    }
    return () => {
      const recorder = active.current;
      const remove = () => {
        if (pendingRemoval.current !== remove) return;
        pendingRemoval.current = null;
        active.current = undefined;
        if (current?.recorder === recorder) current = undefined;
        quietly(() => {
          if (auth.currentUser?.uid === ownerUid && !['/athlete', '/profile.html'].includes(location.pathname)) recorder?.leave('left_workspace');
          recorder?.close();
        });
      };
      pendingRemoval.current = remove;
      queueMicrotask(remove);
    };
  }, [eligible, ownerUid, playerId]);

  useLayoutEffect(() => { quietly(() => active.current?.show(page)); }, [page, eligible, ownerUid, playerId]);
  return {
    onClick(event: MouseEvent<HTMLDivElement>) {
      if (!event.nativeEvent.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement | HTMLAnchorElement>('button[data-player-journey],a[data-player-journey]');
      if (!button || !event.currentTarget.contains(button) || button.matches(':disabled,[aria-disabled=true]')) return;
      const target = button.dataset.playerJourney;
      if (isJourneyTarget(target)) quietly(() => active.current?.click(target));
    },
    signOut() { quietly(() => active.current?.leave('sign_out')); },
  };
}
