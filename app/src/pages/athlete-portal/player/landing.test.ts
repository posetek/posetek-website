import { describe, expect, it } from 'vitest';
import { defaultPlayerView, landingSeen, markLandingSeen } from './landing';
import type { LandingStore } from './landing';
import { linkNamesPlayerTab, playerRoute } from './workspace';

const memory = (): LandingStore & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};
const blocked: LandingStore = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('workspace landing tab', () => {
  it('lands on Stats the first time, then on Workouts', () => {
    expect(defaultPlayerView({ parent: false, seen: false })).toBe('stats');
    expect(defaultPlayerView({ parent: false, seen: true })).toBe('workouts');
  });

  it('keeps a parent session on Stats', () => {
    expect(defaultPlayerView({ parent: true, seen: false })).toBe('stats');
    expect(defaultPlayerView({ parent: true, seen: true })).toBe('stats');
  });

  it('remembers the first landing per signed-in account', () => {
    const store = memory();
    expect(landingSeen('uid-a', store)).toBe(false);
    markLandingSeen('uid-a', store);
    expect(landingSeen('uid-a', store)).toBe(true);
    expect(landingSeen('uid-b', store)).toBe(false);
    expect([...store.values.keys()]).toEqual(['posetek.workspaceLanding.v1.uid-a']);
  });

  it('treats a missing account or a blocked store as the first time', () => {
    const store = memory();
    markLandingSeen(null, store);
    expect(store.values.size).toBe(0);
    expect(landingSeen(undefined, store)).toBe(false);
    expect(landingSeen('uid-a', null)).toBe(false);
    expect(() => markLandingSeen('uid-a', blocked)).not.toThrow();
    expect(landingSeen('uid-a', blocked)).toBe(false);
    expect(defaultPlayerView({ parent: false, seen: landingSeen('uid-a', blocked) })).toBe('stats');
  });

  it('opens the default only for a link that names no tab', () => {
    expect(playerRoute('', 'workouts')).toMatchObject({ view: 'workouts', screen: null });
    expect(playerRoute('?player=p1&userType=player', 'workouts').view).toBe('workouts');
    expect(playerRoute('?player=p1&workspace=player', 'stats').view).toBe('stats');
    expect(playerRoute('?view=unknown', 'workouts').view).toBe('workouts');
    // Without a default the workspace keeps its Stats landing.
    expect(playerRoute('').view).toBe('stats');
    for (const search of ['?player=p1&workspace=player', '?player=p1&userType=player', '?view=unknown', '']) expect(linkNamesPlayerTab(search)).toBe(false);
  });

  it('lets a link that names a tab win over the default', () => {
    expect(playerRoute('?view=home', 'workouts').view).toBe('home');
    expect(playerRoute('?view=coach', 'workouts').view).toBe('coach');
    expect(playerRoute('?view=stats', 'workouts').view).toBe('stats');
    expect(playerRoute('?view=stats&screen=plan', 'workouts')).toMatchObject({ view: 'stats', screen: 'plan' });
    expect(playerRoute('?view=workouts', 'stats').view).toBe('workouts');
    expect(playerRoute('?view=feed', 'workouts').view).toBe('home');
    expect(playerRoute('?view=profile', 'workouts').view).toBe('stats');
    expect(playerRoute('?drill=sprint&session=s1', 'stats')).toMatchObject({ view: 'workouts', screen: 'test' });
    for (const search of ['?view=home', '?view=stats', '?view=workouts', '?view=training', '?view=leaderboards', '?view=drills', '?drill=jump']) expect(linkNamesPlayerTab(search)).toBe(true);
  });
});
