import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PlayerHeader } from '../PlayerShell';
import type { WorkoutsPage } from '../workspace';
import type { Row } from '../execution';
import AppOnlySheet from './AppOnlySheet';
import type { AppOnlyKind } from './AppOnlySheet';
import { sessionDateText } from './hub';

/** The six measured tests, in the app's order and wording (`DrillsView`). `drill` is the web results key. */
export const MEASURED_TESTS = [
  { drill: 'shooting', title: 'Shooting', detail: 'Measure your striking', icon: 'sports_soccer' },
  { drill: 'dribbling', title: 'Dribbling', detail: 'Control at speed', icon: 'directions_run' },
  { drill: 'jump', title: 'Vertical Jump', detail: 'Explosive power', icon: 'north' },
  { drill: 'broadJump', title: 'Broad Jump', detail: 'Horizontal power', icon: 'north_east' },
  { drill: 'sprint', title: 'Sprint', detail: 'Own your first steps', icon: 'sprint' },
  { drill: 'changeOfDirection', title: 'Shuttle', detail: 'Move with precision', icon: 'turn_right' },
] as const;

/** The second carousel page (`workoutActivities`). Every one of them is recorded or camera-guided in the app. */
export const WORKOUT_ACTIVITIES: { kind: AppOnlyKind; title: string; detail: string; minutes?: number; icon: string }[] = [
  { kind: 'run', title: 'Run', detail: 'Outdoor run', icon: 'directions_run' },
  { kind: 'ride', title: 'Ride', detail: 'Outdoor ride', icon: 'directions_bike' },
  { kind: 'walk', title: 'Walk/Hike', detail: 'Outdoor walk', icon: 'hiking' },
  { kind: 'core', title: 'Core', detail: 'Core circuit', minutes: 15, icon: 'sports_gymnastics' },
  { kind: 'yoga', title: 'Yoga', detail: 'Mobility practice', minutes: 10, icon: 'self_improvement' },
];

function ActivityCard({ title, detail, icon, minutes, onClick, label }: { title: string; detail: string; icon: string; minutes?: number; onClick: () => void; label?: string }) {
  return <button type="button" className="v4-activity-card wk-activity-card" aria-label={label} onClick={onClick}>
    <span className="wk-activity-icon"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{minutes !== undefined && <span className="wk-activity-minutes">{minutes} min</span>}</span>
    <strong>{title}</strong><small>{detail}</small>
  </button>;
}

export function WorkspaceRow({ title, icon, onClick }: { title: string; icon: string; onClick: () => void }) {
  return <button type="button" className="v4-row wk-row" onClick={onClick}><span className="material-symbols-outlined" aria-hidden="true">{icon}</span>{title}<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>;
}

/** The two-page carousel: snap paging, no headings or dots, kept in step with `page=activities`. */
function ActivityPager({ page, onPage, children }: { page: WorkoutsPage; onPage: (page: WorkoutsPage) => void; children: [ReactNode, ReactNode] }) {
  const scroller = useRef<HTMLDivElement>(null), settled = useRef(page), first = useRef(true);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const target = page === 'activities' ? (element.children[1] as HTMLElement | undefined) : (element.children[0] as HTMLElement | undefined);
    if (!target) return;
    const left = target.offsetLeft - (element.children[0] as HTMLElement).offsetLeft;
    if (Math.abs(element.scrollLeft - left) < 2) { first.current = false; return; }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    settled.current = page;
    element.scrollTo({ left, behavior: first.current || reduce ? 'auto' : 'smooth' });
    first.current = false;
  }, [page]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let timer = 0;
    const settle = () => {
      const pages = [...element.children] as HTMLElement[];
      if (pages.length < 2) return;
      const step = pages[1].offsetLeft - pages[0].offsetLeft;
      const next: WorkoutsPage = element.scrollLeft > step / 2 ? 'activities' : 'tests';
      if (next !== settled.current) { settled.current = next; onPage(next); }
    };
    const scrolled = () => { clearTimeout(timer); timer = window.setTimeout(settle, 120); };
    element.addEventListener('scroll', scrolled, { passive: true });
    return () => { clearTimeout(timer); element.removeEventListener('scroll', scrolled); };
  }, [onPage]);
  return <div className="wk-pager" ref={scroller}>
    <div className="wk-pager-page" aria-label="Tests" role="group">{children[0]}</div>
    <div className="wk-pager-page" aria-label="Activities" role="group">{children[1]}</div>
  </div>;
}

type Props = {
  page: WorkoutsPage;
  onPage: (page: WorkoutsPage) => void;
  playerId: string | null | undefined;
  onTest: (drill: string) => void;
  resume: { text: string; onOpen: () => void } | null;
  activeFreeSession: Row | null;
  onWorkout: () => void;
  onSaved: () => void;
  onHistory: () => void;
};

/** The Workouts root (`TrainingHubView.workspaceContent`): carousel, banners, then three rows. */
export default function WorkoutsRoot({ page, onPage, playerId, onTest, resume, activeFreeSession, onWorkout, onSaved, onHistory }: Props) {
  const [appOnly, setAppOnly] = useState<{ title: string; kind: AppOnlyKind } | null>(null);
  const refs = activeFreeSession?.sessionRefs?.length || 0;
  return <section className="wk-root">
    <PlayerHeader title="Workouts" />
    <ActivityPager page={page} onPage={onPage}>
      <div className="v4-activity-grid">{MEASURED_TESTS.map(item => <ActivityCard key={item.drill} title={item.title} detail={item.detail} icon={item.icon} label={`${item.title}, ${item.detail}`} onClick={() => onTest(item.drill)} />)}</div>
      <div className="v4-activity-grid">{WORKOUT_ACTIVITIES.map(item => <ActivityCard key={item.kind} title={item.title} detail={item.detail} icon={item.icon} minutes={item.minutes} onClick={() => setAppOnly({ title: item.title, kind: item.kind })} />)}</div>
    </ActivityPager>
    {activeFreeSession && <button type="button" className="wk-free-banner" onClick={() => setAppOnly({ title: 'Free session in progress', kind: 'freeSession' })}>
      <span className="material-symbols-outlined" aria-hidden="true">radio_button_checked</span>
      <span><strong>Free session in progress</strong><small>{refs} drill{refs === 1 ? '' : 's'} recorded · started {sessionDateText(activeFreeSession.startedAt)}</small></span>
      <span className="material-symbols-outlined wk-chevron" aria-hidden="true">chevron_right</span>
    </button>}
    {resume && <ResumeBanner text={resume.text} onClick={resume.onOpen} />}
    <WorkspaceRow title="Workout" icon="sports" onClick={onWorkout} />
    <WorkspaceRow title="Saved Workouts" icon="bookmark" onClick={onSaved} />
    <WorkspaceRow title="Workout history" icon="history" onClick={onHistory} />
    {appOnly && <AppOnlySheet title={appOnly.title} kind={appOnly.kind} playerId={playerId} onClose={() => setAppOnly(null)} />}
  </section>;
}

/** `TrainingResumeBanner` (V4): an accent line on a capsule. */
export function ResumeBanner({ text, onClick, disabled }: { text: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="wk-resume" disabled={disabled} onClick={onClick}><span className="material-symbols-outlined" aria-hidden="true">resume</span><span>{text}</span></button>;
}
