import { PlayerHeader } from '../PlayerShell';
import type { PlayerTabProps } from '../workspace';

/** Home: the athlete's week and the community feed (the app's `AthleteWorkspaceHome`). */
export default function PlayerHome(_props: PlayerTabProps) {
  return <>
    <PlayerHeader title="Home" />
    <section className="portal-card"><p className="muted-copy">Your week will appear here.</p></section>
  </>;
}
