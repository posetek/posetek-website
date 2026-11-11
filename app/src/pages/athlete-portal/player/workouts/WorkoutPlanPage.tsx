import PlayerTraining from '../PlayerTraining';
import type { PlayerTabProps } from '../workspace';

type Props = PlayerTabProps & {
  /** Opened from Stats: also shows an active plan that is not a V3 plan, with this week's drills expanded. */
  fromStats?: boolean;
};

/**
 * "My workout plan" (the app's `planPage`): one page, reached from the workout hub and from the
 * report's drills on Stats. It never shows the Saved Workouts or history links. Inside Workouts the
 * tab's own hub renders this page; from Stats this component hosts it with its own plan and logs.
 */
export default function WorkoutPlanPage({ ctx, personal, go, back, fromStats = false }: Props) {
  return <PlayerTraining ctx={ctx} statsProfile={{}} personal={personal} request={null} onAcknowledge={() => {}} page="plan" fromStats={fromStats} go={go} back={back} />;
}
