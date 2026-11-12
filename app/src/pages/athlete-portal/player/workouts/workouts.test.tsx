import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player' } }, db: {}, cloud: {}, storage: {} }));
import PlayerExperience from '../PlayerExperience';
import { previewData } from '../../lib/preview';
import { HistoryList, SavedLibrary } from './HistoryAndSaved';
import WorkoutReview from './WorkoutReview';
import { FreeSessionBanner, HubLinks, PlanInvitationCard, PlanSummaryCard, WorkoutActions } from './WorkoutsRoot';
import PlayerTraining from '../PlayerTraining';
import type { HubPage } from './navigation';

const render = (query: string) => {
  const data = previewData();
  const ctx = { ...data, notify: () => {}, allStatsReps: () => Object.values(data.reps).flat() };
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/athlete?preview=1&${query}`]}><PlayerExperience ctx={ctx} initialReps={data.reps} /></MemoryRouter>);
};
const order = (html: string, words: string[]) => words.map(w => html.indexOf(w)).every((index, i, all) => index >= 0 && (i === 0 || index > all[i - 1]));

describe('Workouts pages, in the app’s order and words', () => {
  it('root is the hub: the plan summary, Create a workout, then Saved Workouts, Workout History and Tests', () => {
    const html = render('view=workouts');
    expect(order(html, ['<h1>Workouts</h1>', 'MY WORKOUT PLAN', 'Own your first touch', 'Week 1 of 2 · 2 sessions this week', 'Next: Keep the ball close · 30 min',
      'Create a workout', 'One session, whenever you want.', 'Build Workout', 'Choose your focus', 'Cardio', 'Walk, run or ride', 'Saved Workouts', 'Workout History', '>Tests<'])).toBe(true);
    // The lifetime totals are on Stats, Training Focus is hidden, and the tests have their own page.
    for (const moved of ['Favorite focus', 'TRAINING FOCUS', 'Measure your striking', 'Core circuit', 'Create your workout']) expect(html).not.toContain(moved);
    // Report and notification links, and links to the hub's former page, arrive here too.
    for (const link of ['view=training', 'view=workouts&screen=workout', 'view=workouts&page=activities']) expect(render(link)).toContain('MY WORKOUT PLAN');
  });
  it('Tests: the six measured tests on their own page', () => {
    const html = render('view=workouts&screen=tests');
    expect(order(html, ['<h1>Tests</h1>', 'Shooting', 'Dribbling', 'Vertical Jump', 'Broad Jump', 'Sprint', 'Shuttle'])).toBe(true);
    expect(html).toContain('aria-label="Shooting, Measure your striking"'); expect(html).not.toContain('MY WORKOUT PLAN');
  });
  it('Stats carries the training totals that left the hub', () => {
    const html = render('view=stats');
    expect(order(html, ['>Training totals</h2>', 'Total time', 'Workouts', 'Favorite focus'])).toBe(true);
  });
  it('My workout plan: the block, the week, the next workout, targets, drills, links', () => {
    const html = render('view=workouts&screen=plan');
    expect(order(html, ['<h1>My workout plan</h1>', 'The block', 'Week 1 of 2', 'days left', 'Next workout', 'Keep the ball close', '2 drills · ~28 min', 'This week&#x27;s targets', 'Time trained', 'This week&#x27;s drills', 'Plan details', 'Start a free session'])).toBe(true);
    expect(html).not.toContain('Saved Workouts'); expect(html).not.toContain('Workout History');
  });
  it('My workout plan from Stats opens with this week’s drills expanded', () => {
    const html = render('view=stats&screen=plan');
    expect(html).toContain('<h1>My workout plan</h1>'); expect(html).toContain('dose shown in each workout');
  });
  it('History and Saved Workouts pages', () => {
    expect(render('view=workouts&screen=history')).toContain('<h1>History</h1>');
    expect(render('view=workouts&screen=history')).toContain('From an earlier plan.');
    const saved = render('view=workouts&screen=saved');
    expect(saved).toContain('<h1>Saved Workouts</h1>'); expect(saved).toContain('All workouts');
  });
});

describe('after a finished workout', () => {
  const personal = { enabled: false, selectionReady: true, conversationId: null, workouts: [], logs: {}, loaded: true, newConversation: () => {}, openConversation: async () => ({}) } as any;
  const page = (name: HubPage) => {
    const data = previewData();
    const ctx = { ...data, notify: () => {}, allStatsReps: () => Object.values(data.reps).flat() } as any;
    return renderToStaticMarkup(<MemoryRouter initialEntries={['/athlete?preview=1&view=workouts']}><PlayerTraining ctx={ctx} statsProfile={{}} personal={personal} request={null} onAcknowledge={() => {}}
      page={name} go={() => {}} back={() => {}} hubNotice={<p>FEEDBACK INVITATION</p>} /></MemoryRouter>);
  };
  it('shows the feedback invitation on whichever Workouts page the athlete lands on', () => {
    for (const name of ['root', 'plan', 'saved', 'history', 'tests'] as const) expect(page(name)).toContain('FEEDBACK INVITATION');
  });
});

describe('Workouts pieces', () => {
  it('the plan summary leaves the next-workout line out when nothing is scheduled', () => {
    const html = renderToStaticMarkup(<PlanSummaryCard model={{ title: 'Your training plan', schedule: 'Week 2 of 6', next: null }} onOpen={() => {}} />);
    expect(order(html, ['MY WORKOUT PLAN', 'Your training plan', 'Week 2 of 6'])).toBe(true); expect(html).not.toContain('wk-plan-card-next');
  });
  it('without a plan the hub invites one, and plan length is no longer chosen here', () => {
    const html = renderToStaticMarkup(<PlanInvitationCard onCreate={() => {}} />);
    expect(order(html, ['WORKOUT PLAN', 'Build a routine that fits you', 'An AI plan shaped around your goals.', 'Create plan'])).toBe(true);
    expect(html).not.toContain('weeks');
  });
  it('Cardio stays when the viewer cannot build a workout; the heading goes with Build Workout', () => {
    const html = renderToStaticMarkup(<WorkoutActions onCreate={null} onCardio={() => {}} />);
    expect(html).toContain('Cardio'); expect(html).not.toContain('Create a workout'); expect(html).not.toContain('Build Workout');
  });
  it('a free session in progress and the grouped links read like the app', () => {
    const banner = renderToStaticMarkup(<FreeSessionBanner session={{ sessionRefs: [{}, {}], startedAt: new Date(2026, 0, 1) }} onClick={() => {}} />);
    expect(order(banner, ['Free session in progress', '2 drills recorded'])).toBe(true);
    expect(order(renderToStaticMarkup(<HubLinks onSaved={() => {}} onHistory={() => {}} onTests={() => {}} />), ['Saved Workouts', 'Workout History', 'Tests'])).toBe(true);
  });
  it('the saved library shows each workout with resume, open or its reason', () => {
    const entries = [{ id: 'cloud:a', source: 'adhoc' as const, workout: { title: 'Speed day', blocks: [{ blockId: 'b', name: 'Flying 10s', sets: 3, reps: 10, repUnit: 'meters' }], estimatedMinutes: 20 }, inProgress: true, unavailableReason: null, type: 'field' },
      { id: 'personal:b', source: 'personal' as const, workout: { title: 'Mine', blocks: [] }, inProgress: false, unavailableReason: 'Completed · create an edited copy to practice again.', type: 'field' }];
    const html = renderToStaticMarkup(<SavedLibrary entries={entries} loading={false} error="" onOpen={() => {}} onEdit={() => {}} />);
    expect(html).toContain('All workouts'); expect(html).toContain('Resume workout'); expect(html).toContain('1 drill · ~20 min · In progress');
    expect(html).toContain('Create an edited copy'); expect(html).not.toContain('No saved workouts');
  });
  it('history says when there is nothing yet', () => {
    expect(renderToStaticMarkup(<HistoryList logs={[]} sessions={[]} planId={null} loading={false} error="" />)).toContain('Workouts you run and free sessions you record will both show up here.');
  });
  it('the workout review reads like the app: summary, drills, then start, resume or ended', () => {
    const workout = { weekNumber: 2, title: 'Quick feet', intro: 'Stay light.', estimatedMinutes: 25, blocks: [{ blockId: 'b1', order: 1, name: 'Ladder', estimatedMinutes: 10, sets: 2, reps: 30, repUnit: 'seconds' }] };
    const fresh = renderToStaticMarkup(<WorkoutReview workout={workout} log={null} start={<button>Start workout</button>} onAdjust={() => {}} onDrill={() => {}} onFull={() => {}} />);
    expect(order(fresh, ['Week 2 · 1 drills · ~25 min', 'Quick feet', 'Stay light.', 'Ladder', '2 × 30 sec', 'list_alt</span>View full workout', 'Tell me what to change', 'Start workout'])).toBe(true);
    const going = renderToStaticMarkup(<WorkoutReview workout={workout} log={{ blocks: [{ blockId: 'b1', status: 'done' }] }} start={<button>Resume workout</button>} onAdjust={() => {}} onDrill={() => {}} onFull={() => {}} />);
    expect(going).toContain('Your session keeps the workout you started.'); expect(going).not.toContain('Tell me what to change'); expect(going).toContain('Done');
    const ended = renderToStaticMarkup(<WorkoutReview workout={workout} log={{ endedAt: 1, endReason: 'completed', blocks: [] }} start={<button>Start workout</button>} onCreateAnother={() => {}} onDrill={() => {}} onFull={() => {}} />);
    expect(ended).toContain('Workout completed. Nice work.'); expect(ended).toContain('Create another workout'); expect(ended).not.toContain('Start workout');
  });
});
