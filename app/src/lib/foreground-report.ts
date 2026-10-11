import { useEffect, useRef } from 'react';

export const REPORT_REFRESH_MS = 60_000;
/** No hidden polling. A visible return/focus and interval share one deadline. */
export function createForegroundRefresh(now: () => number, refresh: () => void) {
  let attemptedAt = now();
  return {
    attempted() { attemptedAt = now(); },
    check(visible: boolean, busy: boolean) {
      if (!visible || busy || now() - attemptedAt < REPORT_REFRESH_MS) return false;
      attemptedAt = now(); refresh(); return true;
    },
  };
}

export function useForegroundReport({ key, refresh, busy, enabled = true, interval = false }: {
  key: string; refresh: () => void; busy: boolean; enabled?: boolean; interval?: boolean;
}) {
  const current = useRef({ refresh, busy });
  useEffect(() => { current.current = { refresh, busy }; }, [refresh, busy]);
  const clock = useRef<ReturnType<typeof createForegroundRefresh> | null>(null);
  useEffect(() => {
    clock.current = createForegroundRefresh(Date.now, () => current.current.refresh());
  }, [key]);
  useEffect(() => {
    if (!enabled) return;
    const check = () => clock.current?.check(document.visibilityState === 'visible', current.current.busy);
    check();
    document.addEventListener('visibilitychange', check); window.addEventListener('focus', check);
    // A short local clock avoids skipping a whole minute when the previous read
    // completes just after an interval boundary. Network reads remain <= 1/min.
    const timer = interval ? window.setInterval(check, 1000) : undefined;
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); if (timer !== undefined) window.clearInterval(timer); };
  }, [key, enabled, interval]);
  useEffect(() => { clock.current?.attempted(); }, [busy]);
}
