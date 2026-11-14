import { describe, expect, it } from 'vitest';
import { BUILD_REFUSED, ENERGY_CHOICES, MINUTE_STOPS, WORKOUT_PLACES, browserTimezone, canBuildWorkout, createReady, createTarget, defaultMinutes, equipmentToday, openingRequest, runMode, usableV3Plan, workoutScope } from './create-workout';
import type { CreateAnswers } from './create-workout';

const answers = (change: Partial<CreateAnswers> = {}): CreateAnswers => ({ place: 'field', goal: true, minutes: 45, energy: 'normal', ...change });

describe('the Create your workout card', () => {
  it('asks where first, soccer field first, in the app’s order and words', () => {
    expect(WORKOUT_PLACES.map(p => [p.id, p.label, p.detail])).toEqual([
      ['field', 'Soccer field', 'Technical and physical workout with the ball'],
      ['gym', 'Gym', 'Weights, bands and a bench'],
      ['home', 'At home', 'Bodyweight and floor exercises'],
    ]);
    expect(ENERGY_CHOICES.map(c => c.id)).toEqual(['low', 'normal', 'high']);
  });
  it('offers the app’s minutes, inside the gateway’s 1–135', () => {
    expect(MINUTE_STOPS).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
    expect(MINUTE_STOPS.every(m => m >= 1 && m <= 135)).toBe(true);
  });
  it('starts on the plan’s session length on the nearest stop, else 30', () => {
    expect(defaultMinutes(30)).toBe(30);
    expect(defaultMinutes(40)).toBe(45);
    expect(defaultMinutes(200)).toBe(120);
    expect(defaultMinutes(5)).toBe(15);
    expect(defaultMinutes(undefined)).toBe(30);
    expect(defaultMinutes(0)).toBe(30);
    for (const m of [10, 22, 61, 135]) expect(MINUTE_STOPS).toContain(defaultMinutes(m));
  });
  it('needs energy, and the goal answer only on a soccer field', () => {
    expect(createReady(answers())).toBe(true);
    expect(createReady(answers({ energy: null }))).toBe(false);
    expect(createReady(answers({ goal: null }))).toBe(false);
    expect(createReady(answers({ place: 'gym', goal: null }))).toBe(true);
    expect(createReady(answers({ place: 'home', goal: null }))).toBe(true);
    expect(createReady(answers({ minutes: 0 }))).toBe(false);
    expect(createReady(answers({ minutes: 136 }))).toBe(false);
  });
});

describe('what the card sends', () => {
  it('opens the workout chat on exactly the app’s `new` target, with no other fields', () => {
    expect(createTarget('plan-1', answers({ place: 'gym', minutes: 60, energy: 'high' }))).toEqual({ kind: 'new', planId: 'plan-1', timeAvailableMinutes: 60, energy: 'high' });
    expect(Object.keys(createTarget('plan-1', answers()))).toEqual(['kind', 'planId', 'timeAvailableMinutes', 'energy']);
  });
  it('puts where the athlete trains in the message box; the ball is assumed and never asked', () => {
    expect(openingRequest({ place: 'field', goal: true })).toMatch(/^Soccer field workout with a ball and a goal\./);
    expect(openingRequest({ place: 'field', goal: false })).toMatch(/^Soccer field workout with a ball and no goal\./);
    expect(openingRequest({ place: 'gym', goal: null })).toMatch(/^Gym workout/);
    expect(openingRequest({ place: 'home', goal: null })).toMatch(/^At-home workout/);
    // The gateway takes 3–500 characters.
    for (const place of ['field', 'gym', 'home'] as const) {
      const text = openingRequest({ place, goal: true }).trim();
      expect(text.length).toBeGreaterThanOrEqual(3);
      expect(text.length).toBeLessThanOrEqual(500);
    }
  });
});

describe('who builds and who runs', () => {
  it('builds for the athlete and an admin (the gateway’s mutation rule); club staff see it disabled', () => {
    expect(canBuildWorkout('athlete')).toBe(true);
    expect(canBuildWorkout('admin')).toBe(true);
    expect(canBuildWorkout('preview')).toBe(true);
    for (const access of ['coach', 'manager', 'shared'] as const) expect(canBuildWorkout(access)).toBe(false);
    expect(BUILD_REFUSED.split(' ').length).toBeLessThanOrEqual(4);
  });
  it('runs live for the athlete, as a walkthrough for an admin, in memory for the sample', () => {
    expect(runMode('athlete')).toBe('live');
    expect(runMode('admin')).toBe('walkthrough');
    expect(runMode('preview')).toBe('preview');
    for (const access of ['coach', 'manager', 'shared'] as const) expect(runMode(access)).toBe('blocked');
  });
  it('needs no plan: workouts belong to the active V3 plan, else to the standalone namespace', () => {
    expect(workoutScope({ id: 'plan-1', schemaVersion: 3, status: 'active' })).toBe('plan-1');
    expect(workoutScope(null)).toBe('standalone');
  });
});

describe('a workout built with no plan', () => {
  it('opens the same `new` chat on the standalone namespace with the timezone and today’s equipment', () => {
    expect(createTarget(null, answers({ minutes: 30, energy: 'low' }), 'America/Los_Angeles')).toEqual({
      kind: 'new', planId: 'standalone', timeAvailableMinutes: 30, energy: 'low', timezone: 'America/Los_Angeles', equipmentToday: ['ball', 'goal'] });
    expect(Object.keys(createTarget(null, answers(), 'UTC'))).toEqual(['kind', 'planId', 'timeAvailableMinutes', 'energy', 'timezone', 'equipmentToday']);
  });
  it('keeps the plan-backed target byte for byte', () => {
    expect(JSON.stringify(createTarget('plan-1', answers(), 'America/Los_Angeles'))).toBe('{"kind":"new","planId":"plan-1","timeAvailableMinutes":45,"energy":"normal"}');
  });
  it('maps where the athlete trains to catalog equipment tokens', () => {
    expect(equipmentToday({ place: 'field', goal: true })).toEqual(['ball', 'goal']);
    expect(equipmentToday({ place: 'field', goal: false })).toEqual(['ball']);
    expect(equipmentToday({ place: 'gym', goal: null })).toEqual(['bench', 'dumbbells', 'resistanceBand']);
    expect(equipmentToday({ place: 'home', goal: null })).toEqual([]);
  });
  // A two-week block from Monday 2026-11-02 ends at the start of 2026-11-16 in Los Angeles.
  const block = (over: Record<string, unknown> = {}) => ({ id: 'plan-1', schemaVersion: 3, status: 'active', horizonWeeks: 2,
    startDate: '2026-11-02', timezone: 'America/Los_Angeles', minutesPerSession: 45, ...over });
  const targetOn = (plan: Record<string, unknown> | null, now: Date) => createTarget(usableV3Plan(plan, now)?.id ?? null, answers(), 'America/Los_Angeles');
  it('builds a standalone workout once the active plan’s block has ended (the app’s `usablePlan`)', () => {
    const ended = new Date('2026-11-20T18:00:00Z');
    expect(usableV3Plan(block(), ended)).toBeNull();
    expect(targetOn(block(), ended)).toEqual({ kind: 'new', planId: 'standalone', timeAvailableMinutes: 45, energy: 'normal',
      timezone: 'America/Los_Angeles', equipmentToday: ['ball', 'goal'] });
  });
  it('keeps a live plan’s target byte for byte', () => {
    const live = new Date('2026-11-10T18:00:00Z');
    expect(usableV3Plan(block(), live)).toEqual(block());
    expect(JSON.stringify(targetOn(block(), live))).toBe('{"kind":"new","planId":"plan-1","timeAvailableMinutes":45,"energy":"normal"}');
  });
  it('counts the block’s last day as live and its end day as ended, on the plan’s calendar', () => {
    // 2026-11-15 23:30 in Los Angeles is the last day; 00:30 on 2026-11-16 there is past the end.
    expect(targetOn(block(), new Date('2026-11-16T07:30:00Z')).planId).toBe('plan-1');
    expect(targetOn(block(), new Date('2026-11-16T08:30:00Z')).planId).toBe('standalone');
    // The same instant is still the last day in a zone further west.
    expect(usableV3Plan(block({ timezone: 'Pacific/Honolulu' }), new Date('2026-11-16T08:30:00Z'))?.id).toBe('plan-1');
  });
  it('is not usable without an active V3 plan of 1 to 12 weeks with a start date', () => {
    const live = new Date('2026-11-10T18:00:00Z');
    for (const plan of [null, block({ status: 'completed' }), block({ schemaVersion: 2 }), block({ id: '' }), block({ horizonWeeks: 13, weeks: [] }), block({ startDate: undefined })])
      expect(usableV3Plan(plan, live)).toBeNull();
  });
  it('sends the browser’s IANA zone', () => {
    const zone = browserTimezone();
    expect(typeof zone).toBe('string');
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
  });
});
