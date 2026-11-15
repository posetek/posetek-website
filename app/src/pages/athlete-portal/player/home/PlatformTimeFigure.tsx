import { platformTimeText } from '../../../../lib/platform-time';
import type { PlatformTime } from '../../../../lib/platform-time';

/** "Time on PoseTek" for the child a parent is viewing (plan §4.6); nothing when there is no figure. */
export function PlatformTimeFigure({ time }: { time: PlatformTime | null }) {
  const text = platformTimeText(time);
  if (!text) return null;
  return <div className="home-recap home-platform-time">
    <span className="home-caption">Time on PoseTek</span>
    <strong>{text}</strong>
  </div>;
}
