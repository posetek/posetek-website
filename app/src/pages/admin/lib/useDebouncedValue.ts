import { useEffect, useState } from "react";

export interface DebouncedValue<T> { value: T; pending: boolean }
export interface Settled<T> { value: T; valueKey: string; contextKey: string }
export type DebounceCommit = "none" | "now" | "later";

// Undefined has no JSON form but is a meaningful value (e.g. "no roster lookup").
const keyOf = (value: unknown) => value === undefined ? "" : JSON.stringify(value);
// Round-trips keyOf output, which came from a value of the same type.
const valueOf = <T>(key: string) => (key === "" ? undefined : JSON.parse(key)) as T;
export const settledOf = <T>(value: T, contextKey: string): Settled<T> => ({ value, valueKey: keyOf(value), contextKey });

/** Pure decision for one render: what to show and when the settled value must catch up. */
export function debounceStep<T>(settled: Settled<T>, current: Settled<T>): DebouncedValue<T> & { commit: DebounceCommit } {
  if (settled.contextKey !== current.contextKey) return { value: current.value, pending: false, commit: "now" };
  if (settled.valueKey === current.valueKey) return { value: settled.value, pending: false, commit: "none" };
  return { value: settled.value, pending: true, commit: "later" };
}

/**
 * Delays changes to `value` until it has been stable for `delayMs`. Whenever
 * `contextKey` changes (scope, page, mode...) the new value is returned at once,
 * so only churn within one context, such as typing, is smoothed. Equality is
 * structural (JSON), so callers may pass a fresh array every render.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, contextKey: string): DebouncedValue<T> {
  const current = settledOf(value, contextKey);
  const [settled, setSettled] = useState(current);
  const { commit, ...output } = debounceStep(settled, current);
  // Adjusting state during render is React's supported way to reset on a changed input.
  if (commit === "now") setSettled(current);
  const { valueKey } = current;
  useEffect(() => {
    if (commit !== "later") return;
    const timer = setTimeout(() => setSettled(settledOf(valueOf<T>(valueKey), contextKey)), delayMs);
    return () => clearTimeout(timer);
  }, [commit, valueKey, contextKey, delayMs]);
  return output;
}
