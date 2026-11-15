import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from '/src/pages/landing/LandingPage';
import FamilyPage from '/src/pages/family/FamilyPage';
import PlayerHome from '/src/pages/athlete-portal/player/home/PlayerHome';
import { captureParentInvitationLink } from '/src/pages/landing/parent-invitation-link';
import { capturePlayerInvitationLink } from '/src/pages/landing/player-invitation-link';
import '/src/styles/base.css';
import '/src/styles/pose-portal.css';

capturePlayerInvitationLink(window);
captureParentInvitationLink(window);

/** A parent session's Home, rendered in the browser so its effects really run. */
function ParentHome() {
  const athlete = { firstName: 'Avery', lastName: 'Synthetic' };
  const props = {
    ctx: { access: 'athlete', guardian: true, guardianPlayerIds: ['child-a'], playerId: 'child-a', athlete, notify: () => {}, allStatsReps: () => [] },
    route: { view: 'home', screen: null, page: 'tests', drill: 'shooting', session: null, rep: null },
    go: () => {}, back: () => {}, active: true, preview: false, athlete, reps: {}, personal: {},
    report: { report: null, limitedComparison: false, error: null, loading: false, reload: () => {} },
  } as never;
  return <div className="pt-pose pt-player"><PlayerHome {...(props as object)} onAddPlayer={() => {}} /></div>;
}
function Elsewhere() {
  const location = useLocation();
  return <p data-route={location.pathname + location.search}>route</p>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes>
  <Route path="/signin" element={<LandingPage />} />
  <Route path="/family" element={<FamilyPage />} />
  <Route path="/parent-home" element={<ParentHome />} />
  <Route path="*" element={<Elsewhere />} />
</Routes></BrowserRouter>);
