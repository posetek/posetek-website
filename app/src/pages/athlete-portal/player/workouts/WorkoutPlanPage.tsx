import { PlayerHeader } from '../PlayerShell';
import type { PlayerTabProps } from '../workspace';

type Props = PlayerTabProps & {
  /** Opened from Stats: also shows an active plan that is not a V3 plan, with this week's drills expanded. */
  fromStats?: boolean;
};

/**
 * "My workout plan" (the app's `planPage`): one page, reached from the workout hub and from the
 * report's drills on Stats. It never shows the Saved Workouts or history links.
 */
export default function WorkoutPlanPage({ back }: Props) {
  return <>
    <PlayerHeader title="My workout plan" onBack={back} />
    <section className="portal-card"><p className="muted-copy">Your plan will appear here.</p></section>
  </>;
}
