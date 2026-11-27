import { describe, expect, it, vi } from 'vitest';
import { coalescedRepRefresh } from './rep-refresh';

function fakeTimers() {
  let now = 0, next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      set: (run: () => void, ms: number) => { const id = next++; pending.set(id, { at: now + ms, run }); return id; },
      clear: (id: unknown) => { pending.delete(id as number); },
      now: () => now,
    },
    advance(ms: number) {
      now += ms;
      for (const [id, entry] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (entry.at <= now) { pending.delete(id); entry.run(); }
      }
    },
    pendingCount: () => pending.size,
  };
}

describe('coalescedRepRefresh', () => {
  it('loads the first server snapshot immediately', () => {
    const clock = fakeTimers(), run = vi.fn();
    coalescedRepRefresh(run, { timers: clock.timers }).signal(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never calls the server for cache-only snapshots', () => {
    const clock = fakeTimers(), run = vi.fn();
    const refresh = coalescedRepRefresh(run, { timers: clock.timers });
    refresh.signal(true);
    expect(run).not.toHaveBeenCalled();
    refresh.signal(false);
    expect(run).toHaveBeenCalledTimes(1);
    refresh.signal(true);
    clock.advance(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of rep changes into one refresh after a quiet period', () => {
    const clock = fakeTimers(), run = vi.fn();
    const refresh = coalescedRepRefresh(run, { waitMs: 3_000, maxWaitMs: 15_000, timers: clock.timers });
    refresh.signal(false);
    for (let i = 0; i < 5; i++) { refresh.signal(false); clock.advance(1_000); }
    expect(run).toHaveBeenCalledTimes(1);
    clock.advance(3_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('still refreshes during a steady stream of changes', () => {
    const clock = fakeTimers(), run = vi.fn();
    const refresh = coalescedRepRefresh(run, { waitMs: 3_000, maxWaitMs: 15_000, timers: clock.timers });
    refresh.signal(false);
    for (let i = 0; i < 16; i++) { refresh.signal(false); clock.advance(1_000); }
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('drops a pending refresh once stopped', () => {
    const clock = fakeTimers(), run = vi.fn();
    const refresh = coalescedRepRefresh(run, { timers: clock.timers });
    refresh.signal(false);
    refresh.signal(false);
    refresh.stop();
    clock.advance(60_000);
    refresh.signal(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(clock.pendingCount()).toBe(0);
  });
});
