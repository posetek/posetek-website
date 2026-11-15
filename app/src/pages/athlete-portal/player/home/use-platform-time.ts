import { useEffect, useState } from 'react';
import { auth } from '../../../../lib/firebase';
import { loadPlatformTime } from '../../../../lib/platform-time';
import type { PlatformTime } from '../../../../lib/platform-time';

/** Loads once per login and child for the page session; a failure leaves it null and never blocks Home. */
export function usePlatformTime(playerId: string | null, enabled: boolean): PlatformTime | null {
  const [loaded, setLoaded] = useState<{ key: string; time: PlatformTime | null } | null>(null);
  const uid = auth.currentUser?.uid || '';
  const key = enabled && playerId && uid ? `${uid}:${playerId}` : '';
  useEffect(() => {
    if (!key || !playerId) return;
    let alive = true;
    void loadPlatformTime(uid, playerId).then(time => { if (alive && auth.currentUser?.uid === uid) setLoaded({ key, time }); });
    return () => { alive = false; };
  }, [key, uid, playerId]);
  return key && loaded?.key === key ? loaded.time : null;
}
