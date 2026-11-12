// The club comparison under the pose player on Stats, drawn as one continuous cloud (Nolan,
// 2026-11-11): the club's average for a test as a smooth line across age, its spread as a soft
// gradient around it, and the athlete's own result(s) on top. Pure: statistics in, curve out.
//
// The chart takes per-age-group statistics, never individual results (`ClubStats`, the shape the
// planned backend callable returns). Turning those into one flowing shape:
//   1. each age group's mean is replaced by a count-weighted local-linear fit over the neighbouring
//      groups (a Gaussian kernel across age), and its spread by the kernel-pooled variance, so a
//      thin group leans on its neighbours and a straight trend stays straight up to both ends;
//   2. a monotone cubic (Steffen) runs through those knots, so the line never overshoots between
//      groups and an omitted group (fewer than 5 athletes) is bridged instead of leaving a hole;
//   3. the cloud spans the first to the last group only: nothing is drawn beyond the data.

/** An age group with fewer athletes than this is left out of the statistics. */
export const MIN_GROUP = 5;
/** Kernel width across age, in years (age groups are one year apart). */
export const BANDWIDTH = 0.75;
/** How far a lone age group's cloud reaches either side of it, in years. */
export const SINGLE_HALF_WIDTH = 0.35;

export type Spread = { count: number; mean: number; sd: number };
export type AgeGroupStats = Spread & { ageGroup: number };
export type OwnResults = { ageGroup: number | null; best: number; results: number[] };

/** One test across a club, by team age group. Every value is in `unit`, as the Stats cards show it. */
export type ClubStats = {
  unit: string;
  higherIsBetter: boolean;
  /** Athletes with a result, with or without an age group. */
  athletes: number;
  /** Age groups of at least MIN_GROUP athletes, youngest first. */
  groups: AgeGroupStats[];
  overall: Spread;
  /** This athlete: their best and every result (one per testing day); null without a result. */
  own: OwnResults | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Mean and sample standard deviation (n − 1); one value, or identical values, have no spread. */
export function spreadOf(values: number[]): Spread {
  const count = values.length;
  if (!count) return { count: 0, mean: 0, sd: 0 };
  if (values.every(value => value === values[0])) return { count, mean: values[0], sd: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  return { count, mean, sd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1)) };
}

/**
 * The chart's statistics from one best value per athlete (stored units), in the units the cards
 * show (`scale`). `ownResults` are this athlete's results per testing day; their best is `own.best`.
 */
export function clubStats(points: { playerId: string; ageGroup: number | null; value: number }[],
  options: { ownId: string; ownResults: number[]; unit: string; scale: number; higherIsBetter: boolean }): ClubStats {
  const shown = (value: number) => value * options.scale;
  const byGroup = new Map<number, number[]>();
  for (const point of points) if (point.ageGroup !== null) byGroup.set(point.ageGroup, [...(byGroup.get(point.ageGroup) ?? []), shown(point.value)]);
  const groups = [...byGroup].filter(([, values]) => values.length >= MIN_GROUP).sort((a, b) => a[0] - b[0])
    .map(([ageGroup, values]) => ({ ageGroup, ...spreadOf(values) }));
  const mine = points.find(point => point.playerId === options.ownId);
  const results = options.ownResults.filter(finite).map(shown);
  return {
    unit: options.unit, higherIsBetter: options.higherIsBetter, athletes: points.length, groups,
    overall: spreadOf(points.map(point => shown(point.value))),
    own: mine ? { ageGroup: mine.ageGroup, best: shown(mine.value), results: results.length ? results : [shown(mine.value)] } : null,
  };
}

// MARK: - Smoothing across age

export type Knot = { age: number; mean: number; sd: number };

const kernel = (distance: number, bandwidth: number) => Math.exp(-0.5 * (distance / bandwidth) ** 2);

/**
 * Each usable age group's mean and spread, smoothed over its neighbours: the mean by a count-weighted
 * local-linear fit (kept within the groups' own range), the spread by the kernel-pooled variance.
 */
export function smoothGroups(groups: AgeGroupStats[], bandwidth = BANDWIDTH): Knot[] {
  const usable = groups.filter(group => group.count >= MIN_GROUP && finite(group.ageGroup) && finite(group.mean) && finite(group.sd) && group.sd >= 0)
    .sort((a, b) => a.ageGroup - b.ageGroup);
  if (!usable.length) return [];
  const low = Math.min(...usable.map(group => group.mean)), high = Math.max(...usable.map(group => group.mean));
  return usable.map(group => {
    let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0, v0 = 0, v1 = 0;
    for (const other of usable) {
      const distance = other.ageGroup - group.ageGroup, near = kernel(distance, bandwidth), weight = near * other.count;
      s0 += weight; s1 += weight * distance; s2 += weight * distance * distance;
      t0 += weight * other.mean; t1 += weight * distance * other.mean;
      v0 += near * (other.count - 1); v1 += near * (other.count - 1) * other.sd * other.sd;
    }
    const determinant = s0 * s2 - s1 * s1;
    const fitted = determinant > 1e-9 * s0 * s2 ? (s2 * t0 - s1 * t1) / determinant : t0 / s0;
    return { age: group.ageGroup, mean: Math.min(high, Math.max(low, fitted)), sd: v0 > 0 ? Math.sqrt(v1 / v0) : 0 };
  });
}

/** Tangents for a monotone cubic through the points (Steffen 1990, as d3's curveMonotoneX). */
export function monotoneSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n < 2) return xs.map(() => 0);
  const secant = (i: number) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  if (n === 2) return [secant(0), secant(0)];
  const slopes = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], s0 = secant(i - 1), s1 = secant(i);
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    slopes[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  // One-sided ends.
  slopes[0] = (3 * secant(0) - slopes[1]) / 2;
  slopes[n - 1] = (3 * secant(n - 2) - slopes[n - 2]) / 2;
  return slopes;
}

/** The club's curve across age: knots with their tangents, defined from `from` to `to` only. */
export type Cloud = { from: number; to: number; ages: number[]; means: number[]; sds: number[]; meanSlopes: number[]; sdSlopes: number[] };

export function cloudFrom(groups: AgeGroupStats[], bandwidth = BANDWIDTH): Cloud | null {
  const knots = smoothGroups(groups, bandwidth);
  if (!knots.length) return null;
  // A lone age group: a short flat cloud on that group, no trend across age.
  const placed = knots.length === 1
    ? [{ ...knots[0], age: knots[0].age - SINGLE_HALF_WIDTH }, { ...knots[0], age: knots[0].age + SINGLE_HALF_WIDTH }] : knots;
  const ages = placed.map(knot => knot.age), means = placed.map(knot => knot.mean), sds = placed.map(knot => knot.sd);
  return {
    from: ages[0], to: ages[ages.length - 1], ages, means, sds,
    meanSlopes: knots.length === 1 ? [0, 0] : monotoneSlopes(ages, means),
    sdSlopes: knots.length === 1 ? [0, 0] : monotoneSlopes(ages, sds),
  };
}

const EPSILON = 1e-9;

function hermite(cloud: Cloud, values: number[], slopes: number[], age: number): number {
  const { ages } = cloud;
  let i = 0;
  while (i < ages.length - 2 && age > ages[i + 1]) i++;
  const h = ages[i + 1] - ages[i], t = Math.min(1, Math.max(0, (age - ages[i]) / h)), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * values[i] + (t3 - 2 * t2 + t) * h * slopes[i] + (-2 * t3 + 3 * t2) * values[i + 1] + (t3 - t2) * h * slopes[i + 1];
}

/** The curve's mean and spread at an age, or null outside the ages the data covers. */
export function cloudAt(cloud: Cloud | null, age: number): { mean: number; sd: number } | null {
  if (!cloud || !finite(age) || age < cloud.from - EPSILON || age > cloud.to + EPSILON) return null;
  return { mean: hermite(cloud, cloud.means, cloud.meanSlopes, age), sd: Math.max(0, hermite(cloud, cloud.sds, cloud.sdSlopes, age)) };
}

/** Lowest and highest value of mean + k·sd over the curve (sampled), for the value axis. */
export function cloudExtent(cloud: Cloud, k: number, samples = 64): [number, number] {
  let low = Infinity, high = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const at = cloudAt(cloud, cloud.from + ((cloud.to - cloud.from) * i) / samples)!;
    low = Math.min(low, at.mean - k * at.sd); high = Math.max(high, at.mean + k * at.sd);
  }
  return [low, high];
}

// MARK: - SVG paths

type Scale = (value: number) => number;
const f = (value: number) => (Math.round(value * 10) / 10).toString();

/** The edge mean + k·sd as cubic Bézier segments in pixels (exact: both scales are linear). */
function edge(cloud: Cloud, k: number, x: Scale, y: Scale, reverse: boolean): string {
  const { ages } = cloud;
  const value = (i: number) => cloud.means[i] + k * cloud.sds[i];
  const slope = (i: number) => cloud.meanSlopes[i] + k * cloud.sdSlopes[i];
  const parts: string[] = [];
  const order = Array.from({ length: ages.length - 1 }, (_, i) => i);
  for (const i of reverse ? order.reverse() : order) {
    const h = (ages[i + 1] - ages[i]) / 3;
    const [a, b] = reverse ? [i + 1, i] : [i, i + 1];
    const direction = reverse ? -1 : 1;
    parts.push(`C${f(x(ages[a] + direction * h))},${f(y(value(a) + direction * h * slope(a)))} ${f(x(ages[b] - direction * h))},${f(y(value(b) - direction * h * slope(b)))} ${f(x(ages[b]))},${f(y(value(b)))}`);
  }
  return parts.join('');
}

/** The average line, one path from the first age group to the last. */
export function linePath(cloud: Cloud, x: Scale, y: Scale): string {
  return `M${f(x(cloud.ages[0]))},${f(y(cloud.means[0]))}${edge(cloud, 0, x, y, false)}`;
}

/** The band from mean − k·sd to mean + k·sd as one closed shape. */
export function bandPath(cloud: Cloud, k: number, x: Scale, y: Scale): string {
  const last = cloud.ages.length - 1;
  return `M${f(x(cloud.ages[0]))},${f(y(cloud.means[0] + k * cloud.sds[0]))}${edge(cloud, k, x, y, false)}`
    + `L${f(x(cloud.ages[last]))},${f(y(cloud.means[last] - k * cloud.sds[last]))}${edge(cloud, -k, x, y, true)}Z`;
}

/**
 * Nested bands from the outside in (k standard deviations each), with opacities chosen so that,
 * stacked, the cloud's opacity follows a normal curve lowered to reach nothing at `extent`:
 * densest on the line, fading through one standard deviation and gone by two, with no edge.
 * Thirty-two bands are enough that the steps between them do not show.
 */
export function cloudLayers(count = 32, peak = 0.32, extent = 2): { k: number; opacity: number }[] {
  const normal = (distance: number) => Math.exp(-0.5 * distance * distance), floor = normal(extent);
  const target = (distance: number) => (peak * (normal(distance) - floor)) / (1 - floor);
  const layers: { k: number; opacity: number }[] = [];
  let reached = 0;
  for (let i = 0; i < count; i++) {
    const outer = (extent * (count - i)) / count, inner = (extent * (count - i - 1)) / count;
    const wanted = target((outer + inner) / 2);
    layers.push({ k: outer, opacity: Math.max(0, 1 - (1 - wanted) / (1 - reached)) });
    reached = wanted;
  }
  return layers;
}

/** The composite opacity of stacked layers at a distance from the line, in standard deviations. */
export function layeredOpacity(layers: { k: number; opacity: number }[], distance: number): number {
  return 1 - layers.filter(layer => Math.abs(distance) <= layer.k).reduce((clear, layer) => clear * (1 - layer.opacity), 1);
}

// MARK: - Axes

const ticksWithin = (from: number, to: number, step: number) => {
  const ticks: number[] = [];
  for (let n = Math.ceil(from / step - 1e-9); n * step <= to + step * 1e-9; n++) ticks.push(Number((n * step).toFixed(10)));
  return ticks;
};

/**
 * A value axis a little wider than [low, high] (never below zero for a measure that cannot be),
 * with gridlines on the finest round step (1, 2 or 5 × 10ⁿ) that needs no more than `maxTicks`.
 */
export function valueAxis(low: number, high: number, maxTicks = 4, floorAtZero = true): { from: number; to: number; step: number; ticks: number[] } {
  if (!finite(low) || !finite(high) || high < low) return { from: 0, to: 1, step: 1, ticks: [0, 1] };
  if (high - low < EPSILON) { const pad = Math.abs(high) * 0.1 || 1; low -= pad; high += pad; }
  const pad = (high - low) * 0.06;
  const from = floorAtZero && low >= 0 ? Math.max(0, low - pad) : low - pad, to = high + pad;
  for (let power = 10 ** Math.floor(Math.log10((to - from) / Math.max(1, maxTicks)) - 1); ; power *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * power, ticks = ticksWithin(from, to, step);
      if (ticks.length <= maxTicks) return { from, to, step, ticks };
    }
  }
}

/** Decimals a tick needs at this step (0.25 → 2, 0.5 → 1, 5 → 0). */
export function stepDigits(step: number): number {
  for (let digits = 0; digits < 4; digits++) if (Math.abs(Math.round(step * 10 ** digits) - step * 10 ** digits) < 1e-6) return digits;
  return 4;
}

// MARK: - Where the athlete stands

export type Standing = {
  /** The age group compared with, or null for the whole club (no curve at the athlete's age). */
  ageGroup: number | null;
  average: number;
  /** The spread (one standard deviation) there. */
  sd: number;
  difference: number;
  better: boolean;
};

/**
 * The average at an age group as stated in words: the group's own statistics when it has enough
 * athletes, else the curve there (an omitted group between two others), else nothing.
 */
export function groupAverage(stats: ClubStats, cloud: Cloud | null, ageGroup: number): { mean: number; sd: number; count: number | null } | null {
  const group = stats.groups.find(entry => entry.ageGroup === ageGroup && entry.count >= MIN_GROUP);
  if (group) return { mean: group.mean, sd: group.sd, count: group.count };
  const at = cloudAt(cloud, ageGroup);
  return at ? { ...at, count: null } : null;
}

/** The athlete's best against the club average for their age group, else against the whole club. */
export function standingOf(stats: ClubStats, cloud: Cloud | null): Standing | null {
  const own = stats.own;
  if (!own || !finite(own.best)) return null;
  const atAge = own.ageGroup !== null ? groupAverage(stats, cloud, own.ageGroup) : null;
  if (!atAge && stats.overall.count < 2) return null;
  const average = atAge ? atAge.mean : stats.overall.mean, difference = own.best - average;
  return { ageGroup: atAge ? own.ageGroup : null, average, sd: atAge ? atAge.sd : stats.overall.sd, difference, better: stats.higherIsBetter ? difference > 0 : difference < 0 };
}
