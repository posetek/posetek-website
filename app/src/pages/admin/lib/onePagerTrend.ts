// Pure helpers for the one-pager tracking tab. The server returns only each
// report's first-event times and a running time-on-page total.
export const ONE_PAGER_TIME_ZONE = "America/Los_Angeles";
export const ONE_PAGER_METRICS = [
  { field: "openedAt", label: "Reports opened", short: "Opened", color: "#2a78d6" },
  { field: "workoutsAt", label: "Workout button clicks", short: "Workout clicks", color: "#eb6834" },
  { field: "testflightAt", label: "TestFlight clicks", short: "TestFlight clicks", color: "#1baf7a" },
] as const;
export const ONE_PAGER_SENT_COLOR = "#657b70";
export type OnePagerMetric = typeof ONE_PAGER_METRICS[number]["field"];
/** `viewSeconds` and `sentAt` are absent until the tracking service that reports them is published.
 * `sentAt` is when the report joined its cohort's sent total; `null` means from the start. */
export type OnePagerReport = { id: string; name: string; viewSeconds?: number; sentAt?: number | null } & Record<OnePagerMetric, number | null>;
export type OnePagerTrendPoint = { at: number; sent: number } & Record<OnePagerMetric, number>;

const HOUR = 3_600_000;

/**
 * Cumulative first-event counts at every moment one of them changed, from the
 * start of tracking through `now`. Every series shares the same times so one
 * hover position reads all of them. Sent ends at `total` and steps up where a
 * report joined the cohort after tracking started; without send times it is level.
 */
export function onePagerTrend(reports: OnePagerReport[], total: number, startAt: number, now: number): OnePagerTrendPoint[] {
  const end = Math.max(now, startAt + 1);
  const clamp = (at: number) => Math.min(Math.max(at, startAt), end);
  const events = Object.fromEntries(ONE_PAGER_METRICS.map(({ field }) => [field,
    reports.map(row => row[field]).filter((at): at is number => typeof at === "number" && Number.isFinite(at)).map(clamp).sort((a, b) => a - b)])) as Record<OnePagerMetric, number[]>;
  // Reports sent after tracking started; every other report counts from the start.
  const later = reports.map(row => row.sentAt).filter((at): at is number => typeof at === "number" && Number.isFinite(at) && at > startAt).map(clamp).sort((a, b) => a - b);
  const times = [...new Set([startAt, ...ONE_PAGER_METRICS.flatMap(({ field }) => events[field]), ...later, end])].sort((a, b) => a - b);
  const cursor = { openedAt: 0, workoutsAt: 0, testflightAt: 0 };
  let sent = 0;
  return times.map(at => {
    for (const { field } of ONE_PAGER_METRICS) while (cursor[field] < events[field].length && events[field][cursor[field]] <= at) cursor[field]++;
    while (sent < later.length && later[sent] <= at) sent++;
    return { at, sent: Math.max(0, total - later.length + sent), ...cursor };
  });
}

const partsFormat = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function pacificParts(at: number) {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(at)).map(part => [part.type, Number(part.value)]));
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
/** The instant a Pacific calendar day begins, including across a clock change. */
export function pacificDayStart(at: number) {
  const { hour, minute, second } = pacificParts(at);
  let start = at - (at % 1000) - ((hour * 60 + minute) * 60 + second) * 1000;
  const drift = pacificParts(start).hour;
  if (drift) start += drift > 12 ? (24 - drift) * HOUR : -drift * HOUR;
  return start;
}

const STEPS_HOURS = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336, 720];
const tickDay = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, month: "short", day: "numeric" });
const tickHour = new Intl.DateTimeFormat("en-US", { timeZone: ONE_PAGER_TIME_ZONE, hour: "numeric" });
/** At most `limit` axis ticks on Pacific hour or day boundaries, labelled to match their spacing. */
export function onePagerTicks(start: number, end: number, limit = 7) {
  const hours = STEPS_HOURS.find(step => (end - start) / (step * HOUR) <= limit) ?? STEPS_HOURS.at(-1)!;
  const values: number[] = [];
  if (hours < 24) {
    for (let at = pacificDayStart(start); at <= end; at += hours * HOUR) if (at >= start) values.push(at);
  } else {
    // Step whole calendar days so a 23- or 25-hour day keeps ticks on midnight.
    for (let at = pacificDayStart(start), index = 0; at <= end; at = pacificDayStart(at + 26 * HOUR), index++) {
      if (at >= start && index % (hours / 24) === 0) values.push(at);
    }
  }
  const label = (at: number) => hours >= 24 || pacificParts(at).hour === 0 ? tickDay.format(at) : tickHour.format(at);
  return { values, label };
}

/** "45 sec", "4 min 12 sec", "1 hr 5 min". */
export function formatViewTime(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} sec`;
  const minutes = Math.floor(whole / 60), rest = whole % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
  const hours = Math.floor(minutes / 60), left = minutes % 60;
  return left ? `${hours} hr ${left} min` : `${hours} hr`;
}

/** Totals across reports with recorded time; `null` when the service does not report it yet. */
export function viewTimeSummary(reports: OnePagerReport[]) {
  if (!reports.some(row => typeof row.viewSeconds === "number")) return null;
  const timed = reports.map(row => row.viewSeconds || 0).filter(seconds => seconds > 0);
  const totalSeconds = timed.reduce((sum, seconds) => sum + seconds, 0);
  return { reports: timed.length, totalSeconds, averageSeconds: timed.length ? totalSeconds / timed.length : 0 };
}
