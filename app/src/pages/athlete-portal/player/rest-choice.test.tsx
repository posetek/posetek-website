import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RestTimerControls from './RestTimerControls';
import { chosenRest, resizeRestTimer, restDefaults, restoreRestChoices, startRestTimer } from './rest-choice';
import { newClock, pauseClock, restSeconds, resumeClock, validClock } from './clock';
import { restoreRuntime, runtimeSnapshot } from './workout-runtime';

const block = { blockId: 'a', sets: 3, reps: 6, repUnit: 'reps', restSeconds: 60 };
const cluster = { ...block, blockId: 'cluster', restScope: 'reps', restSeconds: 20, restBetweenSetsSeconds: 120 };
const owner = { uid: 'synthetic-auth', playerId: 'synthetic-player', logId: 'synthetic-workout', planId: 'synthetic-plan', workoutRevision: 2 };

describe('athlete timer choices preserve prescriptions', () => {
  it('starts at the prescribed default and accepts every integer from zero through that default', () => {
    const original = structuredClone(block);
    expect(chosenRest(block, undefined, 'sets')).toBe(60);
    for (let seconds = 0; seconds <= 60; seconds++) expect(chosenRest(block, { sets: seconds }, 'sets')).toBe(seconds);
    expect(block).toEqual(original);
    for (const invalid of [-1, 61, 15.5, NaN, Infinity, '0', false, null]) expect(chosenRest(block, { sets: invalid as number }, 'sets')).toBe(60);
  });
  it('keeps repetition and set recovery separate, including zero between sets', () => {
    expect(restDefaults(cluster)).toEqual({ reps: 20, sets: 120 });
    expect(chosenRest(cluster, { reps: 0 }, 'sets')).toBe(120);
    expect(chosenRest({ ...cluster, restBetweenSetsSeconds: 0 }, {}, 'sets')).toBe(0);
    expect(restDefaults({ ...cluster, repUnit: 'meters' })).toEqual({ reps: 0, sets: 20 });
  });
  it('keeps elapsed recovery when shortening, extending or clearing a running timer', () => {
    const clock = startRestTimer(newClock(1000), 60, 1000, 'sets');
    const shortened = resizeRestTimer(clock, 45, 16000, 'sets');
    expect(restSeconds(shortened, 16000)).toBe(30);
    const extended = resizeRestTimer(shortened, 60, 21000, 'sets');
    expect(restSeconds(extended, 21000)).toBe(40);
    expect(restSeconds(resizeRestTimer(clock, 10, 16000, 'sets'), 16000)).toBe(0);
    expect(restSeconds(resizeRestTimer(clock, 0, 16000, 'sets'), 16000)).toBe(0);
    expect(resizeRestTimer(clock, 0, 16000, 'reps')).toEqual(clock);
    expect(resizeRestTimer(clock, 60, 61000, 'sets').restUntil).toBeNull(); // expired never restarts itself
  });
  it('adjusts frozen recovery without resuming work or changing active duration', () => {
    const clock = startRestTimer(newClock(1000), 60, 1000, 'sets');
    const paused = pauseClock(clock, 16000), changed = resizeRestTimer(paused, 30, 90000, 'sets');
    expect(changed.runningSince).toBeNull(); expect(changed.frozenRest).toBe(15);
    expect(changed.seconds).toBe(paused.seconds); expect(validClock(changed)).toBe(true);
    expect(restSeconds(resumeClock(changed, 100000), 105000)).toBe(10);
    expect(startRestTimer(paused, 0, 90000, 'sets').restTotal).toBeNull();
  });
  it('restores zero and independent drill settings only for the matching account/workout revision', () => {
    const blocks = [block, cluster];
    const choices = { a: { sets: 0 }, cluster: { reps: 10, sets: 120 }, stale: { sets: 2 } };
    const saved = runtimeSnapshot(owner, blocks, 0, newClock(1000), true, 'tab', choices);
    expect(restoreRuntime(JSON.parse(JSON.stringify(saved)), owner, blocks, null, 2000)?.restChoices).toEqual({ a: { sets: 0 }, cluster: { reps: 10, sets: 120 } });
    expect(restoreRuntime(saved, { ...owner, uid: 'other' }, blocks, null, 2000)).toBeNull();
    expect(restoreRuntime(saved, { ...owner, workoutRevision: 3 }, blocks, null, 2000)).toBeNull();
    expect(restoreRuntime(saved, owner, blocks, { endedAt: 2000 }, 2000)).toBeNull();
    expect(restoreRestChoices({ a: { sets: 90 }, cluster: { reps: '0', sets: 0 } }, blocks)).toEqual({ cluster: { sets: 0 } });
    expect(restoreRuntime({ ...saved, restChoices: undefined }, owner, blocks, null, 2000)?.restChoices).toEqual({});
  });
  it('renders zero and default range labels, distinct scopes, accessible controls and pause disabling', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(<RestTimerControls block={cluster} choice={{ reps: 0, sets: 45 }} onChange={noop} onStart={noop} />);
    expect(html).toContain('Between reps'); expect(html).toContain('Between sets'); expect(html).toContain('No timer');
    expect(html).toContain('min="0" max="20" step="1"'); expect(html).toContain('min="0" max="120" step="1"');
    expect(html).toContain('Default 120s'); expect(html).toContain('aria-valuetext="45 seconds"');
    expect(html.match(/<button[^>]*>Start rep rest<\/button>/)?.[0]).toContain('disabled');
    const paused = renderToStaticMarkup(<RestTimerControls block={cluster} startDisabled onChange={noop} onStart={noop} />);
    expect(paused.match(/<button[^>]*>Start rep rest<\/button>/)?.[0]).toContain('disabled');
    const blocked = renderToStaticMarkup(<RestTimerControls block={block} disabled onChange={noop} onStart={noop} />);
    expect(blocked).toContain('<fieldset disabled="">');
  });
});
