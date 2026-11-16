import { useEffect } from 'react';
import { auth, cloud } from '../firebase';
import { JOURNEY_QUEUE_PREFIX } from '../player-journey/recording';
import { browserClientKind, browserEngagementEnvironment } from './browser';
import { featureForLocation, WEB_USAGE_BUILD as BUILD } from './clock';
import { browserUsageLocks, removeOtherActorQueues, UsageQueue } from './queue';
import type { UsageStorage } from './queue';
import { createUsageSession } from './session';

// Mounted once in the authenticated application's router. Public marketing
// assets remain unchanged. No UID, URL, or selected player enters a payload.
export default function UsageTracking() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let epoch = 0;
    const stopAuth = auth.onAuthStateChanged(async user => {
      const ownEpoch = ++epoch; cleanup?.(); cleanup = undefined;
      let storage: UsageStorage | undefined;
      try { storage = localStorage; } catch { /* Optional browser storage. */ }
      removeOtherActorQueues(storage, user && !user.isAnonymous ? user.uid : null);
      removeOtherActorQueues(storage, user && !user.isAnonymous ? user.uid : null, JOURNEY_QUEUE_PREFIX);
      if (!user || user.isAnonymous) return;
      let context: any;
      try { context = (await cloud.httpsCallable('getClubContext')({})).data; } catch { return; }
      if (epoch !== ownEpoch || auth.currentUser?.uid !== user.uid) return;
      if (context?.role !== 'player') { removeOtherActorQueues(storage, null); return; }
      // A new instance ID avoids the copied sessionStorage ID in duplicated tabs.
      const queue = new UsageQueue(user.uid, crypto.randomUUID(), storage, browserUsageLocks(), Date.now);
      const ownPlayerId = context.players?.[0]?.id;
      const session = createUsageSession({
        uid: user.uid, sessionId: crypto.randomUUID(), build: BUILD, clientKind: browserClientKind(navigator), queue,
        invoke: async batch => (await cloud.httpsCallable('recordInsightUsage')(batch)).data as { accepted?: boolean; reason?: string },
        environment: {
          ...browserEngagementEnvironment(() => auth.currentUser?.uid),
          feature: () => {
            const selected = new URLSearchParams(location.search).get('player');
            return selected && selected !== ownPlayerId ? null : featureForLocation(location.pathname, location.search);
          },
        },
      });
      cleanup = session.close;
      await session.start();
    });
    return () => { epoch++; stopAuth(); cleanup?.(); };
  }, []);
  return null;
}
