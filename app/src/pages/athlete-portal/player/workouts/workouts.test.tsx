import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../../../lib/firebase', () => ({ default: {}, auth: { currentUser: { uid: 'auth-player' } }, db: {}, cloud: {}, storage: {} }));
import PlayerExperience from '../PlayerExperience';
import { previewData } from '../../lib/preview';
import { HistoryList, SavedLibrary } from './HistoryAndSaved';
import WorkoutReview from './WorkoutReview';
import WorkoutsRoot from './WorkoutsRoot';
import PlayerTraining from '../PlayerTraining';
import type { HubPage } from './navigation';

const render = (query: string) => {
  const data = previewData();
  const ctx = { ...data, notify: () => {}, allStatsReps: () => Object.values(data.reps).flat() };
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/athlete?preview=1&${query}`]}><PlayerExperience ctx={ctx} initialReps={data.reps} /></MemoryRouter>);
};
const order = (html: string, words: string[]) => words.map(w => html.indexOf(w)).every((index, i, all) => index >= 0 && (i === 0 || index > all[i - 1]));

describe('Workouts pages, in the app’s order and words', () => {
  it('root: tests, then activities, then the three rows', () => {
    const html = render('view=workouts');
    expect(order(html, ['Shooting', 'Shuttle', '<strong>Run</strong>', 'Walk/Hike', '15 min', '<strong>Core</strong>', 'Core circuit', '10 min', '<strong>Yoga</strong>', 'Mobility practice', '>Workout<', 'Saved Workouts', 'Workout history'])).toBe(true);
    expect(html).not.toContain('Tests</h'); expect(html).toContain('aria-label="Shooting, Measure your striking"');
  });
  it('workout hub on an active V3 plan: stats, plan card, breakdown, create', () => {
    const html = render('view=workouts&screen=workout');
    expect(order(html, ['<h1>Workout</h1>', 'Favorite focus', 'My workout plan', 'Week 1 of 2', 'TRAINING FOCUS', 'Create your workout'])).toBe(true);
    expect(html).not.toContain('Saved Workouts');
    // Report and notification links arrive here too.
    expect(render('view=training')).toContain('My workout plan');
  });
  it('My workout plan: the block, the week, the next workout, targets, drills, links', () => {
    const html = render('view=workouts&screen=plan');
    expect(order(html, ['<h1>My workout plan</h1>', 'The block', 'Week 1 of 2', 'days left', 'Next workout', 'Keep the ball close', '2 drills · ~28 min', 'This week&#x27;s targets', 'Time trained', 'This week&#x27;s drills', 'Plan details', 'Start a free session'])).toBe(true);
    expect(html).not.toContain('Saved Workouts'); expect(html).not.toContain('Workout history');
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
    for (const name of ['root', 'workout', 'plan', 'saved', 'history'] as const) expect(page(name)).toContain('FEEDBACK INVITATION');
  });
});

describe('Workouts pieces', () => {
  it('a resume banner and an active free session sit between the carousel and the rows', () => {
    const html = renderToStaticMarkup(<WorkoutsRoot page="tests" onPage={() => {}} playerId="p" onTest={() => {}} resume={{ text: 'Resume “X” · drill 1 of 2', onOpen: () => {} }}
      activeFreeSession={{ sessionRefs: [{}, {}], startedAt: new Date(2026, 0, 1) }} onWorkout={() => {}} onSaved={() => {}} onHistory={() => {}} />);
    expect(order(html, ['Move with precision', 'Free session in progress', '2 drills recorded', 'Resume “X”', '>Workout<'])).toBe(true);
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
