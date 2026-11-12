import { describe, expect, it } from 'vitest';
import { playerRoute } from '../workspace';
import { needsAllLogs, overlayScroll, resumeAction, workoutsPage, workoutsRoute, workoutsShown } from './navigation';
import type { ResumeTarget } from './hub';

const target = (kind: ResumeTarget['kind']): ResumeTarget => ({ kind, workout: {}, log: {}, title: 'T', drillNumber: 1, drillCount: 2 });

describe('one Workouts instance across tabs', () => {
  it('is shown for its own tab and for My workout plan opened from Stats', () => {
    expect(workoutsShown(playerRoute('?view=workouts&screen=history'))).toBe(true);
    expect(workoutsShown(playerRoute('?view=stats&screen=plan'))).toBe(true);
    expect(workoutsShown(playerRoute('?view=stats'))).toBe(false);
    expect(workoutsShown(playerRoute('?view=home'))).toBe(false);
  });
  it('keeps the last shown route while another tab is on screen, so nothing under it changes', () => {
    const hub = playerRoute('?view=workouts&screen=workout');
    expect(workoutsRoute(playerRoute('?view=home'), hub)).toBe(hub);
    expect(workoutsPage(workoutsRoute(playerRoute('?view=coach'), hub)).page).toBe('workout');
    const plan = playerRoute('?view=workouts&screen=plan');
    expect(workoutsRoute(plan, hub)).toBe(plan);
  });
  it('knows when the plan page came from Stats, and a test’s results', () => {
    expect(workoutsPage(playerRoute('?view=stats&screen=plan'))).toEqual({ page: 'plan', test: false, fromStats: true });
    expect(workoutsPage(playerRoute('?view=workouts&screen=plan'))).toEqual({ page: 'plan', test: false, fromStats: false });
    expect(workoutsPage(playerRoute('?view=workouts&drill=sprint')).test).toBe(true);
    expect(workoutsPage(playerRoute('?view=workouts')).page).toBe('root');
  });
});

describe('the resume banner', () => {
  it('starts a plan or saved workout at once, as the app does', () => {
    expect(resumeAction(target('plan'), { needsCheck: false, atRoot: true, personalLive: false })).toBe('start');
    expect(resumeAction(target('adhoc'), { needsCheck: false, atRoot: false, personalLive: false })).toBe('start');
  });
  it('carries a workout that needs the start check onto the hub, where its review can show', () => {
    expect(resumeAction(target('plan'), { needsCheck: true, atRoot: true, personalLive: false })).toBe('reviewOnHub');
    expect(resumeAction(target('plan'), { needsCheck: true, atRoot: false, personalLive: false })).toBe('review');
  });
  it('returns to a live personal session instead of reopening (and discarding) it', () => {
    expect(resumeAction(target('personal'), { needsCheck: false, atRoot: true, personalLive: true })).toBe('returnToPersonal');
    expect(resumeAction(target('personal'), { needsCheck: false, atRoot: true, personalLive: false })).toBe('openPersonal');
  });
});

describe('scrolling and listeners', () => {
  it('leaves page changes to the workspace and scrolls only presentations inside one page', () => {
    expect(overlayScroll({ page: 'root', key: '' }, { page: 'workout', key: '' })).toBe('none');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'workout', key: '' })).toBe('none');
    expect(overlayScroll({ page: 'plan', key: '' }, { page: 'plan', key: 'review' })).toBe('top');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'plan', key: 'review/full' })).toBe('top');
    expect(overlayScroll({ page: 'plan', key: 'review/full' }, { page: 'plan', key: 'review' })).toBe('restore');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'plan', key: '' })).toBe('restore');
  });
  it('reads every workout log only for the hub and History, and never while hidden', () => {
    expect(needsAllLogs('workout', true)).toBe(true); expect(needsAllLogs('history', true)).toBe(true);
    for (const page of ['root', 'plan', 'saved'] as const) expect(needsAllLogs(page, true)).toBe(false);
    expect(needsAllLogs('history', false)).toBe(false);
  });
});
