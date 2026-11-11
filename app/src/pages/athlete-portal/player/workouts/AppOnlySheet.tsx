import { useEffect, useRef } from 'react';

/** Activities that only the app can record. The words follow the app's own (`OutdoorActivityType`). */
export const APP_ONLY_LINES = {
  run: 'Runs are recorded with GPS in the PoseTek app.',
  ride: 'Rides are recorded with GPS in the PoseTek app.',
  walk: 'Walks and hikes are recorded with GPS in the PoseTek app.',
  core: 'Camera-guided Core circuits run in the PoseTek app.',
  yoga: 'Camera-guided Yoga practice runs in the PoseTek app.',
  freeSession: 'Free sessions are recorded in the PoseTek app.',
} as const;
export type AppOnlyKind = keyof typeof APP_ONLY_LINES;

/** The versioned workout link (mobile `docs/PARENT_WORKOUT_LINK_CONTRACT.md`). It only selects the player's Workouts. */
export const INSTALL_URL = 'https://testflight.apple.com/join/3byuBWYW';
export function appWorkoutsLink(playerId: string | null | undefined): string | null {
  return playerId && /^[A-Za-z0-9_-]{1,128}$/.test(playerId) ? `posetek-workouts-v1://athlete?player=${playerId}&view=training` : null;
}
/** A presentation hint only; it never claims the app is installed. */
export function appleTouchDevice(agent = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints) {
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1);
}
const android = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/**
 * Off until the app-entry link is released. `docs/features/PRIVATE_PARENT_REPORTS.md` ("Installed
 * app boundary") holds every website use of the versioned scheme until a signed TestFlight build
 * has passed the physical-phone check. Until then the sheet only says where the activity runs.
 */
export const APP_ENTRY_RELEASED = false;

function AppLink({ playerId }: { playerId: string | null | undefined }) {
  const href = appWorkoutsLink(playerId);
  if (!APP_ENTRY_RELEASED || !href || android()) return null;
  const body = <>
    <a className="primary-cta" href={href}>Open in the PoseTek app</a>
    <div className="wk-install"><strong>Don't have PoseTek yet?</strong><a href={INSTALL_URL} target="_blank" rel="noopener noreferrer">Install or update PoseTek</a><small>After installing or updating, return here and tap Open in the PoseTek app again.</small></div>
  </>;
  return appleTouchDevice() ? body : <details className="wk-app-disclosure"><summary>On an iPhone or iPad</summary>{body}</details>;
}

/** What a card that only the app can run does in the browser: says so, and offers the app. */
export default function AppOnlySheet({ title, kind, playerId, onClose }: { title: string; kind: AppOnlyKind; playerId: string | null | undefined; onClose: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    done.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="wk-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wk-sheet" role="dialog" aria-modal="true" aria-labelledby="wk-sheet-title">
      <h2 id="wk-sheet-title">{title}</h2>
      <p>{APP_ONLY_LINES[kind]}</p>
      <AppLink playerId={playerId} />
      <button type="button" ref={done} className="wk-secondary" onClick={onClose}>Done</button>
    </section>
  </div>;
}
