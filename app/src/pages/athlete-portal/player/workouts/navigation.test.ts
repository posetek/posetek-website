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
    const saved = playerRoute('?view=workouts&screen=saved');
    expect(workoutsRoute(playerRoute('?view=home'), saved)).toBe(saved);
    expect(workoutsPage(workoutsRoute(playerRoute('?view=coach'), saved)).page).toBe('saved');
    const plan = playerRoute('?view=workouts&screen=plan');
    expect(workoutsRoute(plan, saved)).toBe(plan);
  });
  it('knows when the plan page came from Stats, and a test’s results', () => {
    expect(workoutsPage(playerRoute('?view=stats&screen=plan'))).toEqual({ page: 'plan', test: false, fromStats: true });
    expect(workoutsPage(playerRoute('?view=workouts&screen=plan'))).toEqual({ page: 'plan', test: false, fromStats: false });
    expect(workoutsPage(playerRoute('?view=workouts&drill=sprint')).test).toBe(true);
  });
  it('opens the hub at the root, where older hub and report links land too', () => {
    for (const link of ['?view=workouts', '?view=workouts&screen=workout', '?view=workouts&page=activities', '?view=training']) expect(workoutsPage(playerRoute(link)).page).toBe('root');
    expect(workoutsPage(playerRoute('?view=workouts&screen=tests'))).toEqual({ page: 'tests', test: false, fromStats: false });
  });
});

describe('the resume banner', () => {
  it('starts a plan or saved workout at once, as the app does', () => {
    expect(resumeAction(target('plan'), { needsCheck: false })).toBe('start');
    expect(resumeAction(target('adhoc'), { needsCheck: false })).toBe('start');
  });
  it('shows the review first when the start check must be answered', () => {
    expect(resumeAction(target('plan'), { needsCheck: true })).toBe('review');
    expect(resumeAction(target('adhoc'), { needsCheck: true })).toBe('review');
  });
  it('reopens a personal workout in its own hub', () => {
    expect(resumeAction(target('personal'), { needsCheck: false })).toBe('openPersonal');
    expect(resumeAction(target('personal'), { needsCheck: true })).toBe('openPersonal');
  });
});

describe('scrolling and listeners', () => {
  it('leaves page changes to the workspace and scrolls only presentations inside one page', () => {
    expect(overlayScroll({ page: 'root', key: '' }, { page: 'plan', key: '' })).toBe('none');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'root', key: '' })).toBe('none');
    expect(overlayScroll({ page: 'root', key: '' }, { page: 'root', key: 'intake' })).toBe('top');
    expect(overlayScroll({ page: 'plan', key: '' }, { page: 'plan', key: 'review' })).toBe('top');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'plan', key: 'review/full' })).toBe('top');
    expect(overlayScroll({ page: 'plan', key: 'review/full' }, { page: 'plan', key: 'review' })).toBe('restore');
    expect(overlayScroll({ page: 'plan', key: 'review' }, { page: 'plan', key: '' })).toBe('restore');
  });
  it('reads every workout log only for History, and never while hidden', () => {
    expect(needsAllLogs('history', true)).toBe(true);
    for (const page of ['root', 'plan', 'saved', 'tests'] as const) expect(needsAllLogs(page, true)).toBe(false);
    expect(needsAllLogs('history', false)).toBe(false);
  });
});
