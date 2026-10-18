/** Startup consumes its budget only while the scene is allowed to run. */
export function activeBudget(expire: () => void, milliseconds = 10_000) {
  let remaining = milliseconds, started = 0, timer: ReturnType<typeof setTimeout> | undefined, done = false;
  return {
    setActive(active: boolean) {
      if (done) return;
      if (timer !== undefined) {
        clearTimeout(timer); timer = undefined;
        remaining -= Math.max(0, performance.now() - started);
      }
      if (active) {
        started = performance.now();
        timer = setTimeout(() => { timer = undefined; done = true; expire(); }, Math.max(0, remaining));
      }
    },
    stop() { done = true; if (timer !== undefined) clearTimeout(timer); timer = undefined; },
  };
}
