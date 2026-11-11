import { PlayerHeader } from '../PlayerShell';
import PlayerProfile from '../PlayerProfile';
import { PlayerResultsFeedbackLink } from '../PlayerFeedbackInvitation';
import { showResultsFeedback } from '../feedback-invitation';
import type { playerProfile } from '../scoring';
import type { Row } from '../execution';
import type { PlayerTabProps } from '../workspace';

type Props = PlayerTabProps & { profile: ReturnType<typeof playerProfile>; dataset: Row };

/** Stats: skill benchmarks, the testing report and the body scan (the app's `StatsView`). */
export default function PlayerStats({ ctx, go, profile }: Props) {
  return <>
    <PlayerHeader title="Stats" />
    <PlayerProfile ctx={ctx} profile={profile} onWorkouts={() => go('workouts')}
      onDrills={rep => go('workouts', { drill: 'shooting', session: rep ? rep.sessionFolder || `session${rep.sessionNumber}` : undefined, rep: rep?.id })} />
    {showResultsFeedback(ctx.access, profile.totalReps) && <PlayerResultsFeedbackLink />}
  </>;
}
