// Time on platform for one child (`getAthletePlatformTime`, Parent accounts plan §4.6 and §11.3):
// the estimated foreground time staff already see, counted once across web and iOS. A failed call
// or an unusable answer is "nothing to show"; it never blocks the page.

export type PlatformTimeStatus = "available" | "partial" | "unavailable";
export interface PlatformTime {
  totalMinutes: number | null;
  status: PlatformTimeStatus;
  collectionStartedAtMillis: number | null;
}
export type PlatformTimeCall = (data: { playerId: string }) => Promise<{ data?: unknown }>;

const STATUSES: PlatformTimeStatus[] = ["available", "partial", "unavailable"];

/** The response, checked against the requested child. Anything else is null. */
export function parsePlatformTime(playerId: string, data: unknown): PlatformTime | null {
  const value = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (!value || value.playerId !== playerId || !STATUSES.includes(value.status as PlatformTimeStatus)) return null;
  const total = value.totalMinutes, started = value.collectionStartedAtMillis;
  if (total !== null && !(typeof total === "number" && Number.isFinite(total) && total >= 0)) return null;
  return {
    totalMinutes: total as number | null,
    status: value.status as PlatformTimeStatus,
    collectionStartedAtMillis: typeof started === "number" && Number.isFinite(started) ? started : null,
  };
}

// One answer per login and child for this page session; a failure is not kept, so a later visit retries.
const cache = new Map<string, Promise<PlatformTime | null>>();
export function forgetPlatformTime(): void { cache.clear(); }

async function defaultCall(data: { playerId: string }) {
  const { cloud } = await import("./firebase");
  return cloud.httpsCallable("getAthletePlatformTime")(data);
}

export function loadPlatformTime(uid: string, playerId: string, call: PlatformTimeCall = defaultCall): Promise<PlatformTime | null> {
  const key = `${uid}:${playerId}`;
  const known = cache.get(key);
  if (known) return known;
  const pending = call({ playerId })
    .then(response => parsePlatformTime(playerId, response?.data))
    .catch(() => null)
    .then(result => { if (!result) cache.delete(key); return result; });
  cache.set(key, pending);
  return pending;
}

/** "3 h 20 min", "45 min", "2 h"; null when the figure is hidden (unavailable or no total). */
export function platformTimeText(time: PlatformTime | null | undefined): string | null {
  if (!time || time.status === "unavailable" || time.totalMinutes === null) return null;
  const minutes = Math.round(time.totalMinutes);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
