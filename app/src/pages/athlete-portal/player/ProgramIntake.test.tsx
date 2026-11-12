import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player' } }, db: {}, cloud: {}, storage: {} }));
import ProgramIntake, { initialPlanWeeks, planIntakeAccess, planIntakeBlock, planRequestParams, requestPlan } from './ProgramIntake';
import type { PlanAnswers } from './ProgramIntake';

const answers = (over: Partial<PlanAnswers> = {}): PlanAnswers => ({ weeks: 6, goals: ['dribbling'], text: '', days: 3, setting: 'solo', age: 15, pain: false, ...over });
const snapshot = { schemaVersion: 1, benchmarkProfile: { ageBand: 'u16', gender: 'male', isDefaulted: false }, totalReps: 4, totalSessions: 2, overallScore: 70, axes: [], drills: [] };
const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(<ProgramIntake playerId="p1" athlete={{}} statsProfile={{}} preview={false} access="athlete" onReady={() => {}} onBack={() => {}} {...props} />);

describe('plan setup: the app’s questions on generate_training_plan', () => {
  it('sends the app’s v3 request: goals, days, an hour, standard gear, setting, age, length, no pain', () => {
    const params = planRequestParams(answers({ goals: ['speedAgility', 'shooting'], text: '  tryouts in March ', days: 4, setting: 'partner', weeks: 8, age: 16 }), { position: 'CB' }, snapshot);
    expect(params.planVersion).toBe(3);
    expect(params.statsProfile).toBe(snapshot);
    expect(typeof params.timezone).toBe('string');
    expect(params.intake).toEqual({ horizonWeeks: 8, sessionsPerWeek: 4, minutesPerSession: 60, setting: 'partner',
      equipment: ['ball', 'cones', 'markers', 'goal', 'timer', 'wall'], level: 'club', painFlag: false, age: 16, position: 'CB',
      goals: ['speedAgility', 'shooting'], freeTextGoals: 'tryouts in March' });
  });
  it('leaves blank text and an unknown position out, and infers the level from the stats snapshot', () => {
    const params = planRequestParams(answers(), {}, { ...snapshot, overallScore: 90 });
    expect(params.intake).not.toHaveProperty('freeTextGoals');
    expect(params.intake).not.toHaveProperty('position');
    expect(params.intake.level).toBe('performance');
    expect(planRequestParams(answers(), {}, { ...snapshot, overallScore: 40 }).intake.level).toBe('foundation');
  });
  it('without a stats snapshot still sends a valid empty one, at the club level', () => {
    const params = planRequestParams(answers({ setting: 'halfAndHalf', days: 1, weeks: 1 }), {}, {});
    expect(params.statsProfile.schemaVersion).toBe(1);
    expect(params.intake).toMatchObject({ level: 'club', setting: 'halfAndHalf', sessionsPerWeek: 1, horizonWeeks: 1 });
  });
  it('pain pauses: nothing is submitted', async () => {
    const submit = vi.fn(async () => ({ id: 'job' }));
    expect(planIntakeBlock(answers({ pain: true }))).toBe('pain');
    expect(await requestPlan('p1', answers({ pain: true }), {}, snapshot, submit)).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    expect(await requestPlan('p1', answers(), {}, snapshot, submit)).toBe('job');
    expect(submit).toHaveBeenCalledWith('p1', 'generate_training_plan', expect.objectContaining({ planVersion: 3 }));
  });
  it('needs a goal and an age, like the app', () => {
    expect(planIntakeBlock(answers({ goals: [] }))).toBe('goals');
    expect(planIntakeBlock(answers({ age: undefined }))).toBe('age');
    expect(planIntakeBlock(answers())).toBeNull();
  });
  it('opens at six weeks, or at the length the button named', () => {
    expect(initialPlanWeeks()).toBe(6);
    expect(initialPlanWeeks(4)).toBe(4);
    expect(initialPlanWeeks(5)).toBe(4);
    expect(render()).toContain('<strong>6</strong> weeks');
    expect(render({ weeks: 8 })).toContain('<strong>8</strong> weeks');
  });
  it('prefills a known age, and asks when none is recorded', () => {
    expect(render({ athlete: { age: 17, ageRecordedAt: new Date() } })).toContain('<strong>17</strong>');
    expect(render()).toContain('aria-valuetext="Not chosen"');
  });
});

describe('who may build a plan', () => {
  it('the athlete and staff looking at an athlete get the form; a shared link is told to sign in', () => {
    for (const access of ['athlete', 'coach', 'manager', 'admin', undefined] as const) expect(planIntakeAccess(access)).toBe('form');
    expect(planIntakeAccess('preview')).toBe('sample');
    expect(planIntakeAccess('shared')).toBe('refused');
    expect(render({ access: 'admin' })).toContain('Build my plan');
    const shared = render({ access: 'shared' });
    expect(shared).toContain('Sign in to build a plan.'); expect(shared).not.toContain('Build my plan');
  });
  it('uses no staff-tool wording', () => {
    const html = render({ preview: true, access: 'preview' });
    expect(html).toContain('What do you want to get better at?');
    for (const word of ['draft', 'Draft', 'activat', 'Activat', 'evidence', 'Evidence']) expect(html).not.toContain(word);
  });
});
