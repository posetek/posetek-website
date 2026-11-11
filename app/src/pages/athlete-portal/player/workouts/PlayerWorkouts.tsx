import { useEffect, useState } from 'react';
import { drillByKey } from '../../lib/drills';
import DrillDashboard from '../../views/DrillDashboard';
import SessionView from '../../views/SessionView';
import { PlayerHeader } from '../PlayerShell';
import PlayerTraining from '../PlayerTraining';
import PlayerFeedbackInvitation, { PlayerResultsFeedbackLink } from '../PlayerFeedbackInvitation';
import { showResultsFeedback } from '../feedback-invitation';
import type { Row } from '../execution';
import type { PlayerTabProps } from '../workspace';

type Props = PlayerTabProps & {
  statsProfile: Row;
  request: Row | null;
  onAcknowledge: () => void;
  onCompleted?: () => void;
  feedbackInvitation: boolean;
  onDismissFeedback: () => void;
};

/** The six measured tests, in the app's order and wording (`DrillsView`). `drill` is the web results key. */
export const MEASURED_TESTS = [
  { drill: 'shooting', title: 'Shooting', detail: 'Measure your striking', icon: 'sports_soccer' },
  { drill: 'dribbling', title: 'Dribbling', detail: 'Control at speed', icon: 'directions_run' },
  { drill: 'jump', title: 'Vertical Jump', detail: 'Explosive power', icon: 'north' },
  { drill: 'broadJump', title: 'Broad Jump', detail: 'Horizontal power', icon: 'north_east' },
  { drill: 'sprint', title: 'Sprint', detail: 'Own your first steps', icon: 'sprint' },
  { drill: 'changeOfDirection', title: 'Shuttle', detail: 'Move with precision', icon: 'turn_right' },
] as const;

/** Workouts: tests, activities and the workout hub (the app's `TrainingHubView` workspace). */
export default function PlayerWorkouts({ ctx, route, go, back, reps, personal, statsProfile, request, onAcknowledge, onCompleted, feedbackInvitation, onDismissFeedback }: Props) {
  const hub = route.screen === 'workout' || route.screen === 'plan' || route.screen === 'saved' || route.screen === 'history';
  // The hub stays mounted once opened so a workout in progress survives a look at another page.
  const [hubOpened, setHubOpened] = useState(hub);
  useEffect(() => { if (hub) setHubOpened(true); }, [hub]);
  const drill = drillByKey(route.drill), drillReps = reps[drill.key] || [];
  const test = MEASURED_TESTS.find(item => item.drill === drill.key);
  return <>
    {route.screen === null && <>
      <PlayerHeader title="Workouts" />
      <div className="v4-activity-grid">
        {MEASURED_TESTS.map(item => <button type="button" key={item.drill} className="v4-activity-card" aria-label={`${item.title}, ${item.detail}`} onClick={() => go('workouts', { drill: item.drill })}>
          <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.detail}</small>
        </button>)}
      </div>
      <button type="button" className="v4-row" onClick={() => go('workouts', { screen: 'workout' })}><span className="material-symbols-outlined" aria-hidden="true">sports</span>Workout<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
    </>}
    {route.screen === 'test' && <section className="player-drills">
      <PlayerHeader title={test?.title || drill.label} onBack={route.session ? () => go('workouts', { drill: drill.key, replace: true }) : back} />
      {route.session
        ? <SessionView drill={drill} folder={route.session} selectedId={route.rep} reps={drillReps} access={ctx.access} playerId={ctx.playerId} shareToken={null} onBack={() => go('workouts', { drill: drill.key, replace: true })} onSelectRep={id => go('workouts', { drill: drill.key, session: route.session!, rep: String(id), replace: true })} />
        : <DrillDashboard drill={drill} reps={drillReps} athlete={ctx.athlete} onOpenRep={(folder, id) => go('workouts', { drill: drill.key, session: folder, rep: String(id) })} />}
      <p className="muted-copy">Record and process new drills in the PoseTek app. Video appears here when it was saved to the cloud.</p>
      {showResultsFeedback(ctx.access, drillReps.length) && <PlayerResultsFeedbackLink />}
    </section>}
    {hubOpened && <div hidden={!hub}>
      <PlayerHeader title="Workout" onBack={back} />
      {feedbackInvitation && <PlayerFeedbackInvitation onDismiss={onDismissFeedback} />}
      <PlayerTraining ctx={ctx} statsProfile={statsProfile} personal={personal} request={hub ? request : null} onAcknowledge={onAcknowledge} onCompleted={onCompleted} />
    </div>}
  </>;
}
