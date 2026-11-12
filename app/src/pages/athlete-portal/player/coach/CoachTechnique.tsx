import { useLocation, useNavigate } from 'react-router-dom';
import type { Row } from '../execution';
import { PlayerHeader } from '../PlayerShell';
import TechniqueAnalysis from '../TechniqueAnalysis';

/**
 * Technique analysis, pushed from the Coach tab as the app's `navigationDestination` does
 * (`AICoachTabView.showTechnique`). The page is a real history entry, `?view=coach&screen=technique`,
 * so browser Back and the compact Back control both return to the chat, which stays mounted.
 */
export const TECHNIQUE_SCREEN = 'technique';

function techniqueSearch(search: string, open: boolean) {
  const params = new URLSearchParams(search);
  if (open) { params.set('view', 'coach'); params.set('screen', TECHNIQUE_SCREEN); } else params.delete('screen');
  return params.toString();
}

export function CoachTechniqueLink() {
  const location = useLocation(), navigate = useNavigate();
  return <button type="button" className="coach-technique-link" onClick={() => {
    navigate({ pathname: location.pathname, search: techniqueSearch(location.search, true) }, { state: { coachTechnique: true } });
    window.scrollTo({ top: 0 });
  }}>
    <span className="material-symbols-outlined" aria-hidden="true">sports_soccer</span>Technique analysis
  </button>;
}

export function CoachTechniquePage({ playerId, preview, reps, onReplay }: { playerId: string; preview: boolean; reps: Row[]; onReplay: (rep: Row) => void }) {
  const location = useLocation(), navigate = useNavigate();
  if (new URLSearchParams(location.search).get('screen') !== TECHNIQUE_SCREEN) return null;
  const back = () => {
    if ((location.state as Row | null)?.coachTechnique) navigate(-1);
    else navigate({ pathname: location.pathname, search: techniqueSearch(location.search, false) }, { replace: true });
  };
  return <div className="coach-technique-page">
    <PlayerHeader title="Technique analysis" onBack={back} />
    <TechniqueAnalysis playerId={playerId} reps={reps} preview={preview} onReplay={onReplay} />
  </div>;
}
