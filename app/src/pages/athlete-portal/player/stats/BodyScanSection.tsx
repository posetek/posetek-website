import BodyProfileView from '../../views/BodyProfileView';
import type { PortalContext } from '../../views/shared';
import { bodyHeightText, bodyWeightText } from './stats-format';

/**
 * "Body scan" (the app's `pose` slot): the scan viewer, then height and weight from the player
 * record. The viewer is the shared `BodyProfileView`; stats.css trims its staff-page chrome so it
 * reads as the app's single panel. Taking a scan needs the iPhone camera, so the viewer's
 * "Capture on mobile" note stays where the app shows "Take Body Scan".
 */
export default function BodyScanSection({ ctx }: { ctx: PortalContext }) {
  const height = bodyHeightText(ctx.athlete?.height), weight = bodyWeightText(ctx.athlete?.weight);
  return <section className="stats-body" aria-labelledby="stats-body-title">
    <h2 id="stats-body-title" className="stats-section-title">Body scan</h2>
    <div className="v4-card stats-body-card">
      <div className="stats-body-viewer"><BodyProfileView ctx={ctx} /></div>
      <div className="stats-body-measurements">
        <span><span className="material-symbols-outlined" aria-hidden="true">height</span><span className="stats-sr-only">Height: </span>{height}</span>
        <span><span className="material-symbols-outlined" aria-hidden="true">scale</span><span className="stats-sr-only">Weight: </span>{weight}</span>
      </div>
    </div>
  </section>;
}
