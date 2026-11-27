// The reps listener is only a change signal for `getAthleteEffectiveResults`,
// and each call re-reads the athlete's whole rep history on the server. A
// recording session writes a rep and then updates it as processing lands, so
// one rep can signal several times within seconds. Coalesce those signals:
// the first server snapshot loads at once, later changes wait for a quiet
// period, and a steady stream still refreshes at least every `maxWaitMs`.

export const REP_REFRESH_WAIT_MS = 3_000;
export const REP_REFRESH_MAX_WAIT_MS = 15_000;

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
  now: () => number;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function coalescedRepRefresh(run: () => void, { waitMs = REP_REFRESH_WAIT_MS, maxWaitMs = REP_REFRESH_MAX_WAIT_MS, timers = browserTimers } = {}) {
  let loaded = false, stopped = false, handle: unknown = null, firstPendingAt: number | null = null;
  const fire = () => {
    handle = null; firstPendingAt = null;
    if (!stopped) run();
  };
  return {
    /** One reps snapshot. Cache-only snapshots carry no new server data and never call the server. */
    signal(fromCache: boolean) {
      if (stopped || fromCache) return;
      if (!loaded) { loaded = true; run(); return; }
      const at = timers.now();
      firstPendingAt ??= at;
      if (handle !== null) timers.clear(handle);
      handle = timers.set(fire, Math.max(0, Math.min(waitMs, firstPendingAt + maxWaitMs - at)));
    },
    stop() {
      stopped = true;
      if (handle !== null) timers.clear(handle);
      handle = null;
    },
  };
}
