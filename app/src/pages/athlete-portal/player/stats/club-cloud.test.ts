import { describe, expect, it } from 'vitest';
import {
  MIN_GROUP, SINGLE_HALF_WIDTH, bandPath, clubStats, cloudAt, cloudExtent, cloudFrom, cloudLayers, layeredOpacity, linePath, monotoneSlopes, smoothGroups,
  spreadOf, standingOf, stepDigits, valueAxis,
} from './club-cloud';
import type { AgeGroupStats, ClubStats } from './club-cloud';

const group = (ageGroup: number, mean: number, sd = 1, count = 10): AgeGroupStats => ({ ageGroup, count, mean, sd });
const identity = (value: number) => value;

describe('statistics from points', () => {
  it('takes the mean and the sample standard deviation (n − 1)', () => {
    const spread = spreadOf([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(spread.count).toBe(8);
    expect(spread.mean).toBe(5);
    expect(spread.sd).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(spreadOf([3])).toEqual({ count: 1, mean: 3, sd: 0 });
    expect(spreadOf([])).toEqual({ count: 0, mean: 0, sd: 0 });
  });

  it('gives identical values no spread at all', () => {
    expect(spreadOf([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toEqual({ count: 7, mean: 0.1, sd: 0 });
  });

  it('groups athletes by age group in the units of the cards, leaving out groups under five', () => {
    const points = [
      ...[1, 2, 3, 4, 5].map((value, i) => ({ playerId: `u11-${i}`, ageGroup: 11, value })),
      ...[2, 4, 6, 8].map((value, i) => ({ playerId: `u12-${i}`, ageGroup: 12, value })), // four athletes: omitted
      ...[3, 3, 3, 3, 3, 3].map((value, i) => ({ playerId: `u13-${i}`, ageGroup: 13, value })),
      { playerId: 'no-team-age', ageGroup: null, value: 10 },
    ];
    const stats = clubStats(points, { ownId: 'u11-2', ownResults: [3, 2.5], unit: 'cm', scale: 10, higherIsBetter: true });
    expect(MIN_GROUP).toBe(5);
    expect(stats.groups.map(entry => [entry.ageGroup, entry.count, entry.mean])).toEqual([[11, 5, 30], [13, 6, 30]]);
    expect(stats.groups[0].sd).toBeCloseTo(Math.sqrt(250 / 4) * 2, 10);
    expect(stats.groups[1].sd).toBe(0);
    // Every athlete with a result counts overall, with or without an age group.
    expect(stats.athletes).toBe(16);
    expect(stats.overall.count).toBe(16);
    expect(stats.own).toEqual({ ageGroup: 11, best: 30, results: [30, 25] });
    expect(stats.unit).toBe('cm');
  });

  it('gives an athlete without a result no point, and one without day results their best', () => {
    const points = [{ playerId: 'a', ageGroup: 11, value: 2 }];
    expect(clubStats(points, { ownId: 'me', ownResults: [], unit: 's', scale: 1, higherIsBetter: false }).own).toBeNull();
    expect(clubStats(points, { ownId: 'a', ownResults: [], unit: 's', scale: 1, higherIsBetter: false }).own).toEqual({ ageGroup: 11, best: 2, results: [2] });
  });
});

describe('smoothing across age', () => {
  it('keeps a straight trend straight, up to both ends', () => {
    const knots = smoothGroups([8, 9, 10, 11, 12].map(age => group(age, 2 * age, 1, 5 + age)));
    knots.forEach(knot => expect(knot.mean).toBeCloseTo(2 * knot.age, 9));
  });

  it('lets a thin group lean on its neighbours more than a full one', () => {
    const thin = smoothGroups([group(10, 10, 1, 40), group(11, 20, 1, 5), group(12, 10, 1, 40)]);
    const full = smoothGroups([group(10, 10, 1, 5), group(11, 20, 1, 40), group(12, 10, 1, 5)]);
    expect(thin[1].mean).toBeLessThan(full[1].mean);
    expect(full[1].mean).toBeLessThan(20);
    expect(thin[1].mean).toBeGreaterThanOrEqual(10);
  });

  it('pools the spread and never leaves the range of the group means', () => {
    const knots = smoothGroups([group(8, 0, 1, 50), group(9, 10, 2, 50), group(10, 12, 3, 5)]);
    knots.forEach(knot => { expect(knot.mean).toBeGreaterThanOrEqual(0); expect(knot.mean).toBeLessThanOrEqual(12); });
    expect(knots[1].sd).toBeGreaterThan(1);
    expect(knots[1].sd).toBeLessThan(3);
  });

  it('ignores a group under five athletes even if one is passed in', () => {
    expect(smoothGroups([group(10, 5, 1, 4), group(11, 6)]).map(knot => knot.age)).toEqual([11]);
  });

  it('never overshoots between knots (monotone cubic)', () => {
    const xs = [0, 1, 2, 3, 4], ys = [0, 0, 5, 5.2, 9];
    const slopes = monotoneSlopes(xs, ys);
    expect(slopes[1]).toBe(0);
    const cloud = cloudFrom(xs.map((age, i) => group(age + 8, ys[i], 0, 10)), 0.01)!;
    for (let age = 8; age <= 12; age += 0.05) {
      const at = cloudAt(cloud, age)!;
      const i = Math.min(3, Math.floor(age - 8));
      expect(at.mean).toBeGreaterThanOrEqual(Math.min(ys[i], ys[i + 1]) - 1e-9);
      expect(at.mean).toBeLessThanOrEqual(Math.max(ys[i], ys[i + 1]) + 1e-9);
    }
  });
});

describe('the cloud', () => {
  it('bridges an age group omitted for too few athletes, as one continuous shape', () => {
    // U13 had fewer than five athletes and is not in the statistics.
    const cloud = cloudFrom([group(11, 10, 1), group(12, 11, 1.5), group(14, 14, 2), group(15, 15, 2)])!;
    const at = cloudAt(cloud, 13)!;
    expect(at).not.toBeNull();
    expect(at.mean).toBeGreaterThan(cloudAt(cloud, 12)!.mean);
    expect(at.mean).toBeLessThan(cloudAt(cloud, 14)!.mean);
    expect(at.sd).toBeGreaterThan(1.4);
    expect(at.sd).toBeLessThan(2.1);
    // One outline (no gap, no second piece) and one line.
    const band = bandPath(cloud, 2, identity, identity);
    expect(band.match(/M/g)).toHaveLength(1);
    expect(band.endsWith('Z')).toBe(true);
    expect(linePath(cloud, identity, identity).match(/M/g)).toHaveLength(1);
  });

  it('draws nothing beyond the first and last age groups', () => {
    const cloud = cloudFrom([group(9, 5), group(10, 6), group(12, 8)])!;
    expect([cloud.from, cloud.to]).toEqual([9, 12]);
    expect(cloudAt(cloud, 8.99)).toBeNull();
    expect(cloudAt(cloud, 12.01)).toBeNull();
    expect(cloudAt(cloud, 9)).not.toBeNull();
    expect(cloudAt(cloud, 12)).not.toBeNull();
    // The outline's horizontal extent is exactly the data's.
    const xs = [...bandPath(cloud, 2, identity, identity).matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(12);
  });

  it('collapses onto the line when every value is the same', () => {
    const cloud = cloudFrom([group(10, 7.75, 0), group(11, 7.75, 0), group(12, 7.75, 0)])!;
    for (const age of [10, 10.5, 11.7, 12]) {
      expect(cloudAt(cloud, age)!.mean).toBeCloseTo(7.75, 12);
      expect(cloudAt(cloud, age)!.sd).toBe(0);
    }
    cloudExtent(cloud, 2).forEach(edge => expect(edge).toBeCloseTo(7.75, 12));
    expect(bandPath(cloud, 2, identity, identity)).toBe(`M10,7.8C10.3,7.8 10.7,7.8 11,7.8C11.3,7.8 11.7,7.8 12,7.8L12,7.8C11.7,7.8 11.3,7.8 11,7.8C10.7,7.8 10.3,7.8 10,7.8Z`);
  });

  it('gives a single age group a short flat cloud on that group only', () => {
    const cloud = cloudFrom([group(11, 2.6, 0.2)])!;
    expect(cloud.from).toBeCloseTo(11 - SINGLE_HALF_WIDTH, 12);
    expect(cloud.to).toBeCloseTo(11 + SINGLE_HALF_WIDTH, 12);
    expect(SINGLE_HALF_WIDTH).toBeLessThan(0.5);
    expect(cloudAt(cloud, 11)!.mean).toBeCloseTo(2.6, 12);
    expect(cloudAt(cloud, 11)!.sd).toBeCloseTo(0.2, 12);
    expect(cloudAt(cloud, 10)).toBeNull();
    expect(cloudAt(cloud, 12)).toBeNull();
  });

  it('has no cloud without an age group of five', () => {
    expect(cloudFrom([])).toBeNull();
    expect(cloudFrom([group(11, 2, 1, 4)])).toBeNull();
    expect(cloudAt(null, 11)).toBeNull();
  });

  it('is densest on the line and fades through one and two standard deviations to nothing', () => {
    const layers = cloudLayers();
    const at = (distance: number) => layeredOpacity(layers, distance);
    expect(at(0)).toBeGreaterThan(at(0.5));
    expect(at(0.5)).toBeGreaterThan(at(1));
    expect(at(1)).toBeGreaterThan(at(1.5));
    expect(at(1.5)).toBeGreaterThan(at(1.95));
    expect(at(1.95)).toBeGreaterThan(0);
    expect(at(2.01)).toBe(0);
    // A normal curve lowered to reach zero at two standard deviations: no visible outer edge.
    expect(at(1) / at(0)).toBeCloseTo((Math.exp(-0.5) - Math.exp(-2)) / (1 - Math.exp(-2)), 1);
    expect(at(1.95)).toBeLessThan(at(0) * 0.03);
    layers.forEach(layer => { expect(layer.opacity).toBeGreaterThan(0); expect(layer.opacity).toBeLessThan(1); });
  });
});

describe('axis and standing', () => {
  it('puts a few round gridlines inside a slightly padded value range, never below zero', () => {
    const jump = valueAxis(1, 32, 4);
    expect(jump.from).toBe(0);
    expect(jump.ticks).toEqual([0, 10, 20, 30]);
    const sprint = valueAxis(2.05, 2.95, 4);
    expect(sprint.ticks).toEqual([2, 2.5, 3]);
    expect(stepDigits(sprint.step)).toBe(1);
    expect(valueAxis(7.75, 7.75, 4).ticks.length).toBeGreaterThan(1);
  });

  const stats = (own: ClubStats['own'], higherIsBetter = false): ClubStats => ({
    unit: 's', higherIsBetter, athletes: 30, groups: [group(11, 2.6, 0.2), group(12, 2.5, 0.2), group(14, 2.4, 0.2)], overall: { count: 30, mean: 2.5, sd: 0.2 }, own,
  });

  it("compares the athlete's best with their age group's own average", () => {
    const own = { ageGroup: 11, best: 2.7, results: [2.7, 2.9] };
    const cloud = cloudFrom(stats(own).groups);
    const standing = standingOf(stats(own), cloud)!;
    expect(standing).toMatchObject({ ageGroup: 11, average: 2.6, sd: 0.2, better: false });
    expect(standing.difference).toBeCloseTo(0.1, 12);
    expect(standingOf(stats(own, true), cloud)!.better).toBe(true);
  });

  it('uses the curve for an age group omitted between two others', () => {
    const cloud = cloudFrom(stats(null).groups);
    const standing = standingOf(stats({ ageGroup: 13, best: 2.3, results: [2.3] }), cloud)!;
    expect(standing.ageGroup).toBe(13);
    expect(standing.average).toBeCloseTo(cloudAt(cloud, 13)!.mean, 12);
    expect(standing.average).toBeLessThan(2.5);
    expect(standing.average).toBeGreaterThan(2.4);
  });

  it('falls back to the whole club outside the curve, and says nothing without a result', () => {
    const cloud = cloudFrom(stats(null).groups);
    expect(standingOf(stats({ ageGroup: 9, best: 2.4, results: [2.4] }), cloud)).toMatchObject({ ageGroup: null, average: 2.5, better: true });
    expect(standingOf(stats({ ageGroup: null, best: 2.4, results: [2.4] }), cloud)).toMatchObject({ ageGroup: null, average: 2.5 });
    expect(standingOf(stats(null), cloud)).toBeNull();
  });
});
