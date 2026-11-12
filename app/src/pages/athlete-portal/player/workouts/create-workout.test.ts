import { describe, expect, it } from 'vitest';
import { BUILD_REFUSED, ENERGY_CHOICES, MINUTE_STOPS, WORKOUT_PLACES, buildWorkoutStep, canBuildWorkout, createReady, createTarget, defaultMinutes, openingRequest, runMode } from './create-workout';
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
  it('sets up a plan first when there is no active V3 plan', () => {
    expect(buildWorkoutStep(true)).toBe('card');
    expect(buildWorkoutStep(false)).toBe('plan');
  });
});
