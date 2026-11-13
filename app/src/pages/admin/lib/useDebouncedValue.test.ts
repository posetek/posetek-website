import { afterEach, describe, expect, it, vi } from "vitest";
import { debounceStep } from "./useDebouncedValue";

const entry = (value: string[] | undefined, contextKey = "ctx") => ({ value, valueKey: JSON.stringify(value ?? null), contextKey });

/** Mirrors the hook's effect so timing can be driven with fake timers. */
function simulate(delayMs: number, first: ReturnType<typeof entry>) {
  let settled = first, timer: ReturnType<typeof setTimeout> | undefined;
  return {
    render(current: ReturnType<typeof entry>) {
      const step = debounceStep(settled, current);
      clearTimeout(timer);
      if (step.commit === "now") settled = current;
      if (step.commit === "later") timer = setTimeout(() => { settled = current; }, delayMs);
      return step;
    },
    get settled() { return settled; },
  };
}
afterEach(() => vi.useRealTimers());

describe("debounceStep", () => {
  it("holds the previous value while the value churns within one context", () => {
    vi.useFakeTimers();
    const sim = simulate(400, entry(["a", "b"]));
    expect(sim.render(entry(["a"])).value).toEqual(["a", "b"]);
    vi.advanceTimersByTime(300);
    const typing = sim.render(entry([]));
    expect(typing).toMatchObject({ value: ["a", "b"], pending: true });
    vi.advanceTimersByTime(399);
    expect(sim.render(entry([])).pending).toBe(true);
    vi.advanceTimersByTime(400);
    expect(sim.settled.value).toEqual([]);
    expect(sim.render(entry([]))).toMatchObject({ value: [], pending: false, commit: "none" });
  });
  it("applies a changed context immediately", () => {
    const sim = simulate(400, entry(["a"], "page-0"));
    expect(sim.render(entry(["x"], "page-1"))).toMatchObject({ value: ["x"], pending: false, commit: "now" });
    expect(sim.settled.value).toEqual(["x"]);
  });
  it("is quiet when the value is unchanged, including undefined", () => {
    expect(debounceStep(entry(undefined), entry(undefined))).toMatchObject({ pending: false, commit: "none" });
    expect(debounceStep(entry(["a"]), entry(["a"]))).toMatchObject({ pending: false, commit: "none" });
  });
});
